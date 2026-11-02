// 戦の後の感想の受け付け（kaito 11/1・docs/kaito_play_1101.md の H）。結果の画面の端に小さく一つだけ。
import { VERSION } from './screens.js';

const TO = 'kaitoseto1129@gmail.com';

export function feedbackMailUrl(battleName, won) {
  const app = window.__iosApp ? 'iPhone のアプリ' : window.__androidApp ? 'Android のアプリ' : 'Web';
  const subject = `戦国立身3D 感想：${battleName}（${won ? '勝ち' : '負け'}）・${VERSION}`;
  const body = `【良かった所】\n\n\n【直してほしい所】\n\n\n【おかしいと思った所】\n\n\n――――\n戦：${battleName}（${won ? '勝ち' : '負け'}）\n版：${VERSION}${window.__appVersion ? `（${window.__appVersion}）` : ''}・${app}`;
  return `mailto:${TO}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

// 結果の画面の端へ、小さな一行を足す。メールが開かない端末では、宛先を写す。
export function mountFeedback(parent, battleName, won) {
  if (!parent || parent.querySelector('.fb-note')) return;
  const url = feedbackMailUrl(battleName, won);
  const box = document.createElement('p');
  box.className = 'fb-note';
  box.style.cssText = 'margin:10px 0 0;font-size:12px;line-height:1.6;text-align:center;opacity:.85';
  const a = document.createElement('a');
  a.href = url;
  a.textContent = '感想を送る';
  a.style.cssText = 'display:inline-flex;align-items:center;min-height:44px;padding:0 12px;text-decoration:underline;color:inherit';
  const note = document.createElement('span');
  note.style.cssText = 'display:block;font-size:12px';
  note.textContent = '送ってくれた方に Amazon ギフト券500円（メールの感想だけが対象）';
  const msg = document.createElement('span');
  msg.setAttribute('role', 'status');
  msg.style.cssText = 'display:block;font-size:12px';
  a.addEventListener('click', (e) => {
    // iOS の包み（WKWebView）は外のメールを自分では開けないので、橋で頼む。橋が無ければ普通の mailto に任せる。
    try {
      const h = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.native;
      if (h) { e.preventDefault(); h.postMessage('mailto:' + url.slice(7)); }
    } catch (err) { /* 橋が無い */ }
    // メールの窓が開かなかった時のために、宛先を写せるようにする
    setTimeout(() => {
      if (document.visibilityState !== 'visible') return;
      const copy = () => { msg.textContent = `メールが開かない時は、宛先 ${TO} へお送りください`; };
      try { navigator.clipboard.writeText(TO).then(() => { msg.textContent = `宛先 ${TO} を写しました`; }, copy); } catch (err) { copy(); }
    }, 1500);
  });
  box.append(a, note, msg);
  parent.appendChild(box);
}
