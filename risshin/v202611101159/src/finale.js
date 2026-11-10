// 最終章の締め（docs/finale_spec_1109.md・kaito 11/9 夜）。
//   史実の終わり：天王寺・岡山に勝った後、字幕「大坂城　落城」→「豊臣家　滅亡」→「元和元年」→ 老将の一行 → 一瞬の回想（音と絵だけ）
//   →「天下静謐」→ エンドロール →「もし、ここで終わらなかったなら」の一枚で IF「淀の野」を解放する。
//   本編の途中では IF を予告しない（kaito 11/9 の決め）。この画面は天王寺・岡山に勝った後にだけ出る。
// 絵はキャンバスで描く（外の画像を読まない）。字は少なく、回想には字を出さない。「動きを減らす」では点滅の回想を止めて静かな絵一枚にする。
import { showScreen, RM, hideScreen } from './screens.js';
import { sfx, playMusic, stopMusic } from './audio.js';
import { flagTexture } from './textures.js';

const KEY = 'risshin_hist_end';
export function histEndSeen() { try { return localStorage.getItem(KEY) === '1'; } catch (e) { return false; } }
function markHistEnd() { try { localStorage.setItem(KEY, '1'); } catch (e) { /* 書けなくても先へ進む */ } }

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// 遊んだ人の名簿（保存の本編から読む）：生き残った古参と、討死した者。無ければ空
export function rosterNames(G) {
  const alive = [], dead = [];
  for (const k of G?.kerai || []) (k.alive ? alive : dead).push({ name: k.name, n: k.battles || 0, kerai: true });
  for (const r of G?.roster || []) if (r.alive && (r.battles || 0) >= 2) alive.push({ name: r.name, n: r.battles });
  for (const n of G?.fallen || []) if (!dead.some((d) => d.name === n)) dead.push({ name: n, n: 0 });
  alive.sort((a, b) => b.n - a.n);
  return { alive: alive.slice(0, 8), dead: dead.slice(-8) };
}

// ---- 一瞬の回想の絵（キャンバス）：桶狭間の豪雨・信長の旗・姉川・長篠の煙・燃える本能寺・秀吉の大軍・関ヶ原・六文銭・大坂の炎上 ----
function flagImg(kind) { try { return flagTexture(kind).image; } catch (e) { return null; } }
function rnd(seed) { let s = seed; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; }
const CUTS = [
  ['thunder', (g, w, h, r) => {   // 桶狭間の豪雨
    g.fillStyle = '#20272a'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#121615'; for (let i = 0; i < 9; i++) { const x = r() * w; g.beginPath(); g.moveTo(x - 40, h); g.lineTo(x, h * (0.45 + r() * 0.2)); g.lineTo(x + 40, h); g.fill(); }
    g.strokeStyle = 'rgba(200,210,215,.35)'; g.lineWidth = 1; for (let i = 0; i < 260; i++) { const x = r() * w, y = r() * h; g.beginPath(); g.moveTo(x, y); g.lineTo(x - 6, y + 26); g.stroke(); }
  }],
  ['horagai', (g, w, h) => {      // 信長の旗
    g.fillStyle = '#3a3226'; g.fillRect(0, 0, w, h);
    const im = flagImg('eiraku'), fw = w * 0.22; if (im) g.drawImage(im, w * 0.38, h * 0.07, fw, Math.min(h * 0.86, fw * im.height / im.width));
    g.fillStyle = '#1b160f'; g.fillRect(w * 0.37, h * 0.04, 4, h);
  }],
  ['clash', (g, w, h, r) => {     // 姉川
    g.fillStyle = '#6c7a78'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#3d5a66'; g.fillRect(0, h * 0.55, w, h * 0.25);
    g.fillStyle = '#16130f'; for (let i = 0; i < 40; i++) { const x = r() * w, y = h * (0.5 + r() * 0.3); g.fillRect(x, y - 18, 5, 18); g.fillRect(x + 2, y - 46, 1.5, 30); }
  }],
  ['volley', (g, w, h, r) => {    // 長篠の鉄砲の煙
    g.fillStyle = '#5b5446'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#2a241c'; for (let x = 0; x < w; x += 22) g.fillRect(x, h * 0.62, 3, h * 0.2);
    g.fillRect(0, h * 0.66, w, 3);
    for (let i = 0; i < 26; i++) { const x = r() * w, y = h * (0.45 + r() * 0.2), s = 30 + r() * 60; const gr = g.createRadialGradient(x, y, 0, x, y, s); gr.addColorStop(0, 'rgba(235,232,222,.85)'); gr.addColorStop(1, 'rgba(235,232,222,0)'); g.fillStyle = gr; g.fillRect(x - s, y - s, s * 2, s * 2); }
  }],
  ['fireSpread', (g, w, h, r) => { // 燃える本能寺
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#1a0c06'); gr.addColorStop(1, '#a3360e'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = '#0d0805'; g.beginPath(); g.moveTo(w * 0.2, h * 0.62); g.lineTo(w * 0.5, h * 0.4); g.lineTo(w * 0.8, h * 0.62); g.fill(); g.fillRect(w * 0.26, h * 0.62, w * 0.48, h * 0.4);
    for (let i = 0; i < 30; i++) { const x = w * (0.2 + r() * 0.6), y = h * (0.35 + r() * 0.3), s = 20 + r() * 50; const f = g.createRadialGradient(x, y, 0, x, y, s); f.addColorStop(0, 'rgba(255,190,80,.8)'); f.addColorStop(1, 'rgba(255,90,20,0)'); g.fillStyle = f; g.fillRect(x - s, y - s, s * 2, s * 2); }
  }],
  ['toki', (g, w, h, r) => {      // 秀吉の大軍
    g.fillStyle = '#8b7d62'; g.fillRect(0, 0, w, h);
    const im = flagImg('toyotomi');
    for (let row = 0; row < 4; row++) for (let i = 0; i < 26; i++) { const x = i * (w / 25) + (row % 2) * 12 + r() * 4, y = h * (0.35 + row * 0.12), s = 0.5 + row * 0.25; g.fillStyle = '#1e1a14'; g.fillRect(x, y, 1.5 * s, 40 * s); if (im) g.drawImage(im, x + 1.5 * s, y, 10 * s, 24 * s); }
  }],
  ['gun', (g, w, h, r) => {       // 関ヶ原の霧
    g.fillStyle = '#a9aca6'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 60; i++) { const x = r() * w, y = h * (0.45 + r() * 0.35), a = 0.15 + (y / h - 0.45) * 1.4; g.fillStyle = `rgba(30,28,24,${Math.min(0.85, a)})`; g.fillRect(x, y - 30, 2, 30); g.fillRect(x + 2, y - 30, 9, 16); }
    const gr = g.createLinearGradient(0, h * 0.3, 0, h); gr.addColorStop(0, 'rgba(210,212,206,.8)'); gr.addColorStop(1, 'rgba(210,212,206,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
  }],
  ['horagai', (g, w, h) => {      // 真田の六文銭
    g.fillStyle = '#1a1210'; g.fillRect(0, 0, w, h);
    const im = flagImg('sanada'); const fw = w * 0.22, fh = Math.min(h * 0.86, im ? fw * im.height / im.width : fw * 2);
    if (im) g.drawImage(im, w * 0.39, h * 0.07, fw, fh); else { g.fillStyle = '#9b1d16'; g.fillRect(w * 0.39, h * 0.07, fw, fh); }
  }],
  ['crash', (g, w, h, r) => {     // 大坂の炎上
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#2a0f08'); gr.addColorStop(0.7, '#c2501a'); gr.addColorStop(1, '#1a0b05'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = '#0b0705';
    const cx = w * 0.5; for (let k = 0; k < 5; k++) { const ww = w * (0.24 - k * 0.04), y = h * (0.72 - k * 0.1); g.fillRect(cx - ww / 2, y, ww, h * 0.1); g.beginPath(); g.moveTo(cx - ww / 2 - 14, y); g.lineTo(cx, y - h * 0.05); g.lineTo(cx + ww / 2 + 14, y); g.fill(); }
    g.fillRect(0, h * 0.82, w, h * 0.2);
    for (let i = 0; i < 24; i++) { const x = cx + (r() - 0.5) * w * 0.3, y = h * (0.3 + r() * 0.4), s = 20 + r() * 60; const f = g.createRadialGradient(x, y, 0, x, y, s); f.addColorStop(0, 'rgba(255,170,70,.7)'); f.addColorStop(1, 'rgba(255,80,20,0)'); g.fillStyle = f; g.fillRect(x - s, y - s, s * 2, s * 2); }
  }],
];

// 史実の終わり。onIF：淀の野へ進む・onHome：ホームへ
export function historyEndScreen(G, { onIF, onHome }) {
  const rm = RM();
  const name = G?.name || '';
  const { alive, dead } = rosterNames(G?.mainSave || G);
  const places = ['稲生', '桶狭間', '墨俣', '稲葉山', '金ヶ崎', '姉川', '長篠', '本能寺', '山崎', '賤ヶ岳', '小田原', '関ヶ原', '真田丸', '天王寺・岡山'];
  const roll = [
    ['戦国立身', ''],
    ['戦った地', places.join('　')],
    alive.length ? ['最後まで共に', alive.map((a) => a.name).join('　')] : null,
    dead.length ? ['戦に散った者', dead.map((a) => a.name).join('　')] : null,
    ['企画', 'かいと'],
    ['作り', 'くろーど'],
    ['遊んでくれた人', name],
  ].filter(Boolean);
  const s = showScreen(`<style>
    #fin { position: fixed; inset: 0; background: #050403; color: #ece4d2; overflow: hidden; font-family: serif; z-index: 60; }
    #fin canvas { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; }
    #fin .cap { position: absolute; left: 0; right: 0; top: 50%; transform: translateY(-50%); text-align: center; font: 700 clamp(26px, 6vh, 44px)/1.4 serif; letter-spacing: .3em; opacity: 0; transition: opacity 1.4s; padding: 0 5vw; }
    #fin .cap.sm { font-size: clamp(16px, 3.6vh, 22px); letter-spacing: .12em; font-weight: 600; }
    #fin .cap.on { opacity: 1; }
    #fin .roll { position: absolute; left: 0; right: 0; top: 100%; text-align: center; }
    #fin .roll div { margin: 0 auto 7vh; max-width: 86vw; }
    #fin .roll b { display: block; font-size: 13px; color: #b9ad94; letter-spacing: .2em; margin-bottom: 6px; font-weight: 600; }
    #fin .roll span { font-size: 17px; line-height: 1.9; }
    #fin .roll .title span { font-size: 30px; letter-spacing: .4em; }
    #fin .ask { position: absolute; inset: 0; display: none; flex-direction: column; align-items: center; justify-content: center; gap: 28px; }
    #fin .ask.on { display: flex; }
    #fin .ask p { font: 600 clamp(20px, 4.4vh, 28px)/1.6 serif; letter-spacing: .14em; margin: 0; text-align: center; }
    #fin .ask .row { display: flex; gap: 12px; flex-wrap: wrap; justify-content: center; }
    #fin .ask button { min-height: 48px; min-width: 170px; font: 600 16px serif; padding: 0 20px; }
    #fin .skip { position: absolute; right: max(12px, env(safe-area-inset-right)); bottom: max(12px, env(safe-area-inset-bottom)); min-height: 44px; min-width: 88px; background: rgba(20,16,12,.6); color: #cfc6b2; border: 1px solid rgba(236,228,210,.25); font: 15px serif; }
  </style><div id="fin" role="dialog" aria-label="史実の終わり"><canvas id="fin-cv"></canvas><div class="cap" id="fin-cap" aria-live="polite"></div>
    <div class="roll" id="fin-roll">${roll.map(([k, v], i) => `<div class="${i ? '' : 'title'}"><b>${esc(k)}</b><span>${esc(i ? v : k)}</span></div>`).join('')}</div>
    <div class="ask" id="fin-ask"><p>もし、ここで<br>終わらなかったなら</p><div class="row"><button class="btn primary" id="fin-if">淀の野へ進む</button><button class="btn" id="fin-home">ホームへ戻る</button></div></div>
    <button class="skip" id="fin-skip">飛ばす</button></div>`, true);
  const cv = s.querySelector('#fin-cv'), cap = s.querySelector('#fin-cap'), rollEl = s.querySelector('#fin-roll'), ask = s.querySelector('#fin-ask');
  const timers = [];
  let done = false;
  const at = (t, f) => timers.push(setTimeout(() => { if (!done) f(); }, t * 1000));
  const say = (t, sm = false) => { cap.classList.remove('on'); setTimeout(() => { cap.textContent = t; cap.classList.toggle('sm', sm); if (t) cap.classList.add('on'); }, 500); };
  stopMusic(2);
  // 1. 字幕（「大坂城　落城」→「豊臣家　滅亡」→「元和元年」）。遠くで焼け落ちる音
  at(0.6, () => { say('大坂城　落城'); sfx('fireSpread', 0.4); });
  at(4.6, () => { say('豊臣家　滅亡'); sfx('crash', 0.25); });
  at(8.6, () => say('元和元年'));
  // 2. 老将：陣幕の外、周りは若い兵ばかり。勝鬨にも大きく喜ばない
  at(12.6, () => { cap.style.whiteSpace = 'pre-line'; say(`桶狭間から、五十五年。\n${name ? name + 'の' : ''}髪は、とうに白い。`, true); sfx('sig_eiei', 0.25); });
  at(17.4, () => say('あの頃の戦を知る者は、もう周りにいない。', true));
  // 3. 一瞬の回想（字は出さない。音と絵だけ）
  const cutAt = 21.4, cutLen = rm ? 1.6 : 0.85;
  at(cutAt - 0.4, () => { say(''); });
  const g = cv.getContext('2d');
  const draw = (k) => {
    const w = cv.width = Math.min(1280, innerWidth), h = cv.height = Math.round(w * innerHeight / Math.max(1, innerWidth));
    CUTS[k][1](g, w, h, rnd(97 + k * 31));
    // 古い写真のような暗い縁
    const v = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.7); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.75)'); g.fillStyle = v; g.fillRect(0, 0, w, h);
  };
  CUTS.forEach((c, k) => at(cutAt + k * cutLen, () => {
    draw(k); cv.style.transition = rm ? 'opacity .6s' : 'none'; cv.style.opacity = rm ? '0.8' : '1'; sfx(c[0], 0.5);
    if (!rm) at(cutLen * 0.75, () => { cv.style.opacity = '0.15'; });
  }));
  const after = cutAt + CUTS.length * cutLen + 0.6;
  at(after, () => { cv.style.transition = 'opacity 1.6s'; cv.style.opacity = '0'; });
  // 4. 天下静謐
  at(after + 1.4, () => { cap.style.whiteSpace = ''; say('天下静謐'); sfx('bell', 0.5); });
  at(after + 3, () => { try { playMusic('title', { fade: 3 }); } catch (e) { /* 曲が無くても続ける */ } });
  // 5. エンドロール（ゆっくり上へ流れる。動きを減らす時は流さずに並べる）
  const rollStart = after + 6.4, rollSec = rm ? 0.1 : 26;
  at(rollStart, () => {
    say('');
    if (rm) { rollEl.style.top = '8%'; return; }
    rollEl.style.transition = `transform ${rollSec}s linear`;
    rollEl.style.transform = `translateY(-${innerHeight + rollEl.offsetHeight + 40}px)`;
  });
  // 6.「もし、ここで終わらなかったなら」（ここで淀の野を解放する）
  const showAsk = () => {
    done = true; timers.forEach(clearTimeout);
    markHistEnd();
    cap.classList.remove('on'); rollEl.style.display = 'none'; cv.style.opacity = '0';
    s.querySelector('#fin-skip').remove();
    ask.classList.add('on');
    sfx('koto', 0.6);
    s.querySelector('#fin-if').focus({ preventScroll: true });
  };
  at(rollStart + rollSec + (rm ? 8 : 1), showAsk);
  s.querySelector('#fin-skip').onclick = showAsk;
  s.querySelector('#fin-if').onclick = () => { sfx('ui'); hideScreen(); onIF && onIF(); };
  s.querySelector('#fin-home').onclick = () => { sfx('ui'); hideScreen(); onHome && onHome(); };
  return { skip: showAsk };
}

// 一瞬の回想だけを画面に重ねる（終幕の具足に触れた時など）。ks：CUTS の番号の並び・len：一枚の秒
export function flashCuts(ks, len = 0.8) {
  if (typeof document === 'undefined') return;
  const rm = RM();
  const cv = document.createElement('canvas');
  cv.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:45;pointer-events:none;opacity:0;transition:opacity .25s';
  document.body.appendChild(cv);
  const g = cv.getContext('2d');
  ks.forEach((k, i) => setTimeout(() => {
    const c = CUTS[k]; if (!c) return;
    const w = cv.width = Math.min(1024, innerWidth), h = cv.height = Math.round(w * innerHeight / Math.max(1, innerWidth));
    c[1](g, w, h, rnd(97 + k * 31));
    cv.style.opacity = rm ? '0.55' : '0.9'; sfx(c[0], 0.4);
    if (!rm) setTimeout(() => { cv.style.opacity = '0.2'; }, len * 700);
  }, i * len * 1000));
  setTimeout(() => { cv.style.opacity = '0'; setTimeout(() => cv.remove(), 400); }, ks.length * len * 1000 + 200);
}
