// 戦の後の感想の受け付け（kaito 11/1・docs/kaito_play_1101.md の H）。結果の画面の端に小さく一つだけ。
import { VERSION, storeVersion } from './screens.js';
import { crashNoteText, lastBattleInfo, takeUnaskedCrash } from './crash_note.js';

const TO = 'kaitoseto1129@gmail.com';

// 直近のエラーを端末の中に五件まで溜め、不具合の便りへ添える（kaito 11/9「不具合を自動で作り手へ送る」。送るのは便りの釦を押した時だけ）
const RECENT = [];
try {
  const keep = (t) => { RECENT.push(String(t).replace(/\s+/g, ' ').slice(0, 140)); if (RECENT.length > 5) RECENT.shift(); };
  addEventListener('error', (e) => keep(`${e.message || 'error'} @${String(e.filename || '').split('/').pop()}:${e.lineno || 0}`));
  addEventListener('unhandledrejection', (e) => keep(`promise: ${e.reason && e.reason.message || e.reason}`));
} catch (e) { /* 溜められなくても便りは送れる */ }

// 送る文の下に自動で入れる事：戦・何分目・勝ち負け・落ちたか・版（店の版も）・端末・画面（11/8）
function infoText(o = {}) {
  const app = window.__iosApp ? 'iPhone のアプリ' : window.__androidApp ? 'Android のアプリ' : 'Web';
  const last = lastBattleInfo();
  const name = o.battleName || last?.name || '';
  const lines = [];
  if (name) lines.push(`戦：${name}${o.won != null ? `（${o.won ? '勝ち' : '負け'}）` : ''}${last && (!o.battleName || last.name === o.battleName) ? `・${last.min ?? 0}分目` : ''}`);
  lines.push(`版：${VERSION}・店の版 ${storeVersion()}・${app}`, `端末：${navigator.userAgent}`, `画面：${screen.width}×${screen.height}・${innerWidth}×${innerHeight}`, crashNoteText(), ...(RECENT.length ? ['直近のエラー：', ...RECENT.map((t) => `  ${t}`)] : []));
  return lines.join('\n');
}
const mailUrl = (subject, head, o) => `mailto:${TO}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(`${head}\n\n\n――――（ここから下は自動で入れました）\n${infoText(o)}`)}`;

export function feedbackMailUrl(battleName, won) {
  return mailUrl(`戦国立身3D 感想・不具合：${battleName}（${won ? '勝ち' : '負け'}）・${VERSION}`, '【起きた事・感想】', { battleName, won });
}
// 不具合だけを送る（一時停止の画面・前回止まった時の札から）
export function bugMailUrl(o = {}) {
  return mailUrl(`戦国立身3D 不具合${o.crashed ? '（戦の途中で止まった）' : ''}・${VERSION}`, o.crashed ? '【止まる前にしていた事】' : '【起きた事】', o);
}

// 前回アプリが戦の途中で落ちた時、次に開いた時に一度だけ聞く札（知らせる／知らせない）。しつこくしない
export function askAfterCrash() {
  const died = takeUnaskedCrash();
  if (!died || document.querySelector('.crash-ask')) return;
  const el = document.createElement('div');
  el.className = 'crash-ask';
  el.setAttribute('role', 'alertdialog'); el.setAttribute('aria-labelledby', 'crash-ask-t');
  el.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:9998;max-width:min(30em,calc(100vw - 32px));box-sizing:border-box;padding:16px;background:rgba(20,18,15,.96);color:#f1e9d8;border:1px solid #b8963e;border-radius:8px;font-size:16px;line-height:1.6';
  const url = bugMailUrl({ crashed: true, battleName: died.name });
  const name = String(died.name || '').replace(/[<>&"]/g, '');
  el.innerHTML = `<p id="crash-ask-t" style="margin:0 0 4px">前回、${name ? `「${name}」の` : '戦の'}途中で止まりました。</p><p style="margin:0 0 12px;font-size:15px">作り手に知らせると、直す助けになります。</p>
    <div style="display:flex;gap:8px;flex-wrap:wrap"><a class="btn primary" id="crash-ask-send" href="${url.replace(/"/g, '&quot;')}" style="min-height:44px;display:inline-flex;align-items:center">知らせる</a><button type="button" class="btn" id="crash-ask-no" style="min-height:44px">知らせない</button></div><p role="status" style="margin:8px 0 0;font-size:13px"></p>`;
  document.body.appendChild(el);
  const say = (t) => { el.querySelector('[role=status]').textContent = t; };
  el.querySelector('#crash-ask-send').addEventListener('click', (e) => { mailClick(e, url, say); setTimeout(() => el.remove(), 4000); });
  el.querySelector('#crash-ask-no').onclick = () => el.remove();
  el.querySelector('#crash-ask-no').focus({ preventScroll: true });
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
  a.textContent = '感想・不具合を送る';
  a.style.cssText = 'display:inline-flex;align-items:center;min-height:44px;padding:0 12px;text-decoration:underline;color:inherit';
  // 11/8 critic60 odani・nagashima：勝ちの札の下に買い物の話を出さない（感想を送る一行だけ）
  const msg = document.createElement('span');
  msg.setAttribute('role', 'status');
  msg.style.cssText = 'display:block;font-size:12px';
  a.addEventListener('click', (e) => mailClick(e, url, (t) => { msg.textContent = t; }));
  box.append(a, msg);
  parent.appendChild(box);
}

// メールの窓を開く（a の click から）。say はメールが開かなかった時の一言を出す所
export function mailClick(e, url, say) {
  // iOS の包み（WKWebView）は外のメールを自分では開けないので、橋で頼む。橋が無ければ普通の mailto に任せる。
  try {
    const h = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.native;
    if (h) { e.preventDefault(); h.postMessage('mailto:' + url.slice(7)); }
  } catch (err) { /* 橋が無い */ }
  // メールの窓が開かなかった時のために、宛先を写せるようにする
  setTimeout(() => {
    if (document.visibilityState !== 'visible') return;
    const copy = () => say(`メールが開かない時は、宛先 ${TO} へお送りください`);
    try { navigator.clipboard.writeText(TO).then(() => say(`宛先 ${TO} を写しました`), copy); } catch (err) { copy(); }
  }, 1500);
}

// ホームの「運営へのお願い」（kaito 11/3 AC）：感想と同じメールの形で、足してほしい事・直してほしい事を
export function requestMailUrl() {
  const app = window.__iosApp ? 'iPhone のアプリ' : window.__androidApp ? 'Android のアプリ' : 'Web';
  const subject = `戦国立身3D 運営へのお願い・${VERSION}`;
  const body = `【足してほしい事】\n\n\n【直してほしい事】\n\n\n――――\n版：${VERSION}・店の版 ${storeVersion()}・${app}`;
  return `mailto:${TO}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
