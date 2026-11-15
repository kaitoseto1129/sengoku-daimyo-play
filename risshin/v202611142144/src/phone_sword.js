// 携帯を刀にする（K254・kaito 11/11・11/12「携帯を刀にしてパソコンで遊ぶ（QR でつなぐ・振る・突き・構え）」）。
//   パソコンで戦を開くと隅に QR が一つ出る（設定の「携帯を刀にする」からも開ける）。携帯で読むと sword.html が開き、
//   携帯の振り（DeviceMotion）が PeerJS（WebRTC）で直に届く。くわしくは docs/phone_sword_1111.md。
//   届いた振りは input.phoneSwing（向き＝上段・袈裟・逆袈裟・横薙ぎ・突き／速さ＝重さ）と input.leftPressed へ、
//   構え（携帯を横へ寝かせる・画面を押す）は input.guardHeld へ入れる。当たると携帯へ「当たった」を返して震わせる。
//   部品は src/vendor（読み込み時に外へ取りに行かない）。つなぐ合図の受け渡しだけ PeerJS の公開の受け渡し所（0.peerjs.com）を使う。
let peer = null, conn = null, guardT = 0, timer = 0, buzzAt = 0, closedByUser = false;
const KINDS = { kara: 'kara', kesa: 'kesa', gyaku: 'gyaku', nagi: 'nagi', tsuki: 'kthrust' };

function loadScript(rel) {
  return new Promise((ok, ng) => {
    const url = new URL(rel, import.meta.url).href;
    if (document.querySelector(`script[src="${url}"]`)) return ok();
    const s = document.createElement('script');
    s.src = url; s.onload = ok; s.onerror = () => ng(new Error('読めない ' + rel));
    document.head.appendChild(s);
  });
}

const stat = () => window.__swordStat || (window.__swordStat = { n: 0, kinds: {}, lagMax: 0, lagSum: 0, lagN: 0, hits: 0, rtt: 0 });

// 一つの動きを遊びの入力へ（main.js の input を window.__input で受ける）
export function applySword(m, input = window.__input) {
  if (!m || !input) return;
  const S = stat();
  if (m.t === 's' || m.t === 'k') {
    const k = KINDS[m.t === 'k' ? 'tsuki' : m.d] || 'kesa';
    input.phoneSwing = { k, pow: Math.max(0.85, Math.min(1.3, +m.p || 1)) };
    input.leftPressed = true;
    window.__swordLast = { k, pow: input.phoneSwing.pow, at: performance.now() };   // K317：一騎打ちで相手へ振りの速さを送る（net_duel.js）
    S.n++; S.kinds[k] = (S.kinds[k] || 0) + 1;
    // 遅れ：携帯が振りを読んだ時から、ここへ届くまで（同じ時計の試しの時だけ正しい。実機は往復の半分 rtt/2 で見る）
    if (m.ts) { const lag = Date.now() - m.ts; if (lag >= 0 && lag < 5000) { S.lagSum += lag; S.lagN++; S.lagMax = Math.max(S.lagMax, lag); } }
  } else if (m.t === 'g') { input.guardHeld = !!m.on; guardT = m.on ? performance.now() : 0; }
  else if (m.t === 'm') { setStick(+m.x || 0, +m.y || 0, input); }
  else if (m.t === 'p') { send({ t: 'q', ts: m.ts, ride: riding() }); if (m.rtt) S.rtt = m.rtt; }
}
// K316④：馬に乗っている間は携帯を手綱にする（携帯へ「乗っている」を返し、携帯は傾きを棒と同じ 'm' で送る）
const riding = () => { try { return !!window.__game?.battle?.player?.mounted; } catch (e) { return false; } };
// K312：携帯の親指の棒 → 前後は W/S、左右は向き（input.dx）。0.2 までは遊び
let stickX = 0, stickT = 0;
function setStick(x, y, input) {
  stickX = Math.abs(x) < 0.2 ? 0 : x;
  const f = y < -0.3, b = y > 0.3;
  if (f) input.keys.add('KeyW'); else input.keys.delete('KeyW');
  if (b) input.keys.add('KeyS'); else input.keys.delete('KeyS');
  if (stickX && !stickT) stickT = setInterval(() => { const i = window.__input; if (!i || !stickX) { clearInterval(stickT); stickT = 0; return; } i.dx += stickX * 9; }, 16);
}
function send(m) { try { if (conn && conn.open) conn.send(m); } catch (e) { /* 切れた */ } }
// 当たった時に携帯を震わせる（player_melee.js の strike が呼ぶ。続けて当たっても 80ms に一度）
window.__swordBuzz = (n) => {
  if (!conn || !conn.open) return;
  const t = performance.now(); if (t - buzzAt < 80) return; buzzAt = t;
  stat().hits++; send({ t: 'hit', n });
};

function panel(corner) {
  let el = document.getElementById('sword-pair');
  if (el) return el;
  el = document.createElement('div');
  el.id = 'sword-pair';
  el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', '携帯を刀にする');
  // 戦の中は隅に小さく（戦場の三分の二を空ける）。設定から開いた時は真ん中
  el.style.cssText = (corner
    ? 'position:fixed;left:16px;bottom:140px;'   // 左下の名前と体力の札の上
    : 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);') +
    'z-index:9999;max-width:min(26em,calc(100vw - 32px));box-sizing:border-box;padding:12px;background:rgba(20,18,15,.92);color:#f1e9d8;border:1px solid #b8963e;border-radius:8px;font-size:15px;line-height:1.5;text-align:center';
  el.innerHTML = `<div style="display:flex;align-items:center;gap:8px;justify-content:center">
      <span aria-hidden="true" style="font-size:22px">📱</span><span aria-hidden="true" style="font-size:18px">→</span><span aria-hidden="true" style="font-size:22px">🗡</span></div>
    <div id="sword-qr" style="display:inline-block;background:#fff;padding:8px;border-radius:4px;line-height:0;margin-top:6px"></div>
    <p id="sword-st" role="status" aria-live="polite" style="margin:6px 0;font-size:13px;min-height:1.5em"></p>
    <button type="button" class="btn" id="sword-close" style="min-height:44px;min-width:44px">閉じる</button>`;
  document.body.appendChild(el);
  el.querySelector('#sword-close').onclick = () => { closedByUser = true; el.remove(); };
  return el;
}

export async function openSwordPair(o = {}) {
  const el = panel(!!o.corner);
  const say = (t) => { const s = el.querySelector('#sword-st'); if (s) s.textContent = t; };
  try { await Promise.all([loadScript('./vendor/peerjs.min.js'), loadScript('./vendor/qrcode.js')]); }
  catch (e) { say('部品を読めませんでした'); return; }
  if (conn && conn.open) { say('つながっています'); setTimeout(() => el.remove(), 1200); return; }
  const room = Math.random().toString(36).slice(2, 10);
  // 受け渡し所を替える時（自前の PeerServer・試し）は window.__swordPeerOpts に { host, port, path, secure } を入れる。携帯へも URL で渡す
  const opts = window.__swordPeerOpts || null;
  const url = new URL('sword.html?r=' + room + (opts ? '&ps=' + encodeURIComponent(JSON.stringify(opts)) : ''), location.href.replace(/[?#].*$/, '')).href;
  el.dataset.url = url;
  const qr = window.qrcode(0, 'M'); qr.addData(url); qr.make();
  el.querySelector('#sword-qr').innerHTML = qr.createSvgTag({ cellSize: o.corner ? 3 : 5, margin: 0, scalable: false });
  if (!/^https:/.test(url) && !/^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(url)) say('公開の Web 版の頁で開くと動きます');
  try { peer && peer.destroy(); } catch (e) { /* 前のつながり */ }
  peer = opts ? new window.Peer('risshin-sword-' + room, opts) : new window.Peer('risshin-sword-' + room);
  peer.on('error', () => say('つなぐ所に届きませんでした'));
  peer.on('connection', (c) => {
    try { conn && conn.close(); } catch (e) { /* 前の携帯 */ }
    conn = c;
    c.on('open', () => { say('つながりました'); window.__swordOn = true; setTimeout(() => { if (document.getElementById('sword-pair') === el) el.remove(); }, 1200); });
    c.on('data', (m) => applySword(m));
    c.on('close', () => { if (window.__input) window.__input.guardHeld = false; conn = null; window.__swordOn = false; });
  });
  // 構えの「離した」が届かなくても、0.6秒伝え直しが無ければ構えを解く
  clearInterval(timer);
  timer = setInterval(() => { if (guardT && performance.now() - guardT > 600 && window.__input) { window.__input.guardHeld = false; guardT = 0; } }, 200);
}
// パソコン（指でなく、なぞる道具で遊ぶ端末）の時だけ出す
export const swordOffered = () => { try { return !matchMedia('(pointer:coarse)').matches && !window.__iosApp && !window.__androidApp && location.protocol !== 'app:'; } catch (e) { return false; } };
// 戦を開いた時に隅へ QR を一つ（公開の https の頁だけ。つながっている時・閉じた後・機械の遊び手の時は出さない）
export function offerAtBattle(force = false) {
  if (!force && (!swordOffered() || closedByUser || (conn && conn.open) || navigator.webdriver || location.protocol !== 'https:')) return;
  if (conn && conn.open) return;
  if (document.getElementById('sword-pair')) return;   // 支度の画面で出した QR をそのまま使う（読みかけの QR を替えない）
  openSwordPair({ corner: true });
}
// 戦が終わったら隅の QR を下げる（つながりは次の戦へ持ち越す）
export function hideSwordPair() { const el = document.getElementById('sword-pair'); if (el && el.style.bottom) el.remove(); }
