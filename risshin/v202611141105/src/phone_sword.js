// 携帯を刀にする（K254・kaito 11/11・11/12「携帯を刀にしてパソコンで遊ぶ（QR でつなぐ・振る・突き・構え）」）。
//   パソコンの設定の「携帯を刀にする」から開く。QR を携帯で読むと sword.html が開き、携帯の振り（DeviceMotion）が PeerJS（WebRTC）で直に届く。
//   届いた振りは、左の釦と同じ道（input.leftPressed＝斬る・突く）と構え（input.guardHeld）へ入れる。部品は src/vendor（読み込み時に外へ取りに行かない）。
//   つなぐ合図の受け渡しだけ PeerJS の公開の受け渡し所（0.peerjs.com）を使う。動きそのものは携帯とパソコンの直のつながりで送る。
let peer = null, conn = null, guardT = 0, timer = 0;

function loadScript(rel) {
  return new Promise((ok, ng) => {
    const url = new URL(rel, import.meta.url).href;
    if (document.querySelector(`script[src="${url}"]`)) return ok();
    const s = document.createElement('script');
    s.src = url; s.onload = ok; s.onerror = () => ng(new Error('読めない ' + rel));
    document.head.appendChild(s);
  });
}

// 一つの動きを遊びの入力へ（main.js の input を window.__input で受ける）
export function applySword(m, input = window.__input) {
  if (!m || !input) return;
  if (m.t === 's' || m.t === 'k') input.leftPressed = true;            // 斬る・突く（刀は左の釦と同じ技が出る）
  else if (m.t === 'g') { input.guardHeld = !!m.on; guardT = m.on ? performance.now() : 0; }
}

function panel() {
  let el = document.getElementById('sword-pair');
  if (el) return el;
  el = document.createElement('div');
  el.id = 'sword-pair';
  el.setAttribute('role', 'dialog'); el.setAttribute('aria-labelledby', 'sword-pair-t');
  el.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:9999;max-width:min(26em,calc(100vw - 32px));box-sizing:border-box;padding:16px;background:rgba(20,18,15,.97);color:#f1e9d8;border:1px solid #b8963e;border-radius:8px;font-size:16px;line-height:1.6;text-align:center';
  el.innerHTML = `<p id="sword-pair-t" style="margin:0 0 8px">携帯のカメラで読むと、携帯が刀になります</p>
    <div id="sword-qr" style="display:inline-block;background:#fff;padding:8px;border-radius:4px;line-height:0"></div>
    <p id="sword-st" role="status" aria-live="polite" style="margin:8px 0;font-size:15px;min-height:1.6em"></p>
    <button type="button" class="btn" id="sword-close" style="min-height:44px">閉じる</button>`;
  document.body.appendChild(el);
  el.querySelector('#sword-close').onclick = () => el.remove();
  return el;
}

export async function openSwordPair() {
  const el = panel();
  const say = (t) => { const s = el.querySelector('#sword-st'); if (s) s.textContent = t; };
  try { await Promise.all([loadScript('./vendor/peerjs.min.js'), loadScript('./vendor/qrcode.js')]); }
  catch (e) { say('部品を読めませんでした'); return; }
  if (conn && conn.open) { say('つながっています'); return; }
  const room = Math.random().toString(36).slice(2, 10);
  // 受け渡し所を替える時（自前の PeerServer・試し）は window.__swordPeerOpts に { host, port, path, secure } を入れる。携帯へも URL で渡す
  const opts = window.__swordPeerOpts || null;
  const url = new URL('sword.html?r=' + room + (opts ? '&ps=' + encodeURIComponent(JSON.stringify(opts)) : ''), location.href.replace(/[?#].*$/, '')).href;
  el.dataset.url = url;
  const qr = window.qrcode(0, 'M'); qr.addData(url); qr.make();
  el.querySelector('#sword-qr').innerHTML = qr.createSvgTag({ cellSize: 5, margin: 0, scalable: false });
  if (!/^https:/.test(url)) say('携帯の動きは公開の Web 版の頁でしか読めません');
  else say('読むのを待っています…');
  try { peer && peer.destroy(); } catch (e) { /* 前のつながり */ }
  peer = opts ? new window.Peer('risshin-sword-' + room, opts) : new window.Peer('risshin-sword-' + room);
  peer.on('error', () => say('つなぐ所に届きませんでした。閉じて開き直してください'));
  peer.on('connection', (c) => {
    try { conn && conn.close(); } catch (e) { /* 前の携帯 */ }
    conn = c;
    c.on('open', () => { say('つながりました。携帯を振ると斬ります'); setTimeout(() => { if (document.getElementById('sword-pair') === el) el.remove(); }, 1600); });
    c.on('data', (m) => applySword(m));
    c.on('close', () => { if (window.__input) window.__input.guardHeld = false; conn = null; });
  });
  // 構えの「離した」が届かなくても、0.6秒伝え直しが無ければ構えを解く
  clearInterval(timer);
  timer = setInterval(() => { if (guardT && performance.now() - guardT > 600 && window.__input) { window.__input.guardHeld = false; guardT = 0; } }, 200);
}
// パソコン（指でなく、なぞる道具で遊ぶ端末）の時だけ出す
export const swordOffered = () => { try { return !matchMedia('(pointer:coarse)').matches && !window.__iosApp && !window.__androidApp && location.protocol !== 'app:'; } catch (e) { return false; } };
