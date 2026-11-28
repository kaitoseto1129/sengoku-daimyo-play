// Ping の合図（K580・docs/online_final_1120.md 109「Ping は必須：攻撃・守れ・敵発見・援護・撤退。短い法螺や旗の動きを付けてよい」・11/27 cloud-26・18 の割り）
//   五つの合図を、押した所の地面に絵の印（色と形だけ・字は無し）で出し、短い法螺の音を鳴らす。二人の時は相手の画面にも出す（net の札 { k:'ping' }）。
//   声のチャットは作らない。押し所は右下の丸い釦一つ（#ping-btn）→ 五つの合図の輪 → 選ぶと画面の真ん中の地面に置く（36 の号令の輪には触らない）。
//   同じ合図は 8 秒に一度まで（CLAUDE.md の決まり）。印は 6 秒で消える。match.js の setup から pingLink(rt, net) を呼ぶ（呼ぶ口は 18 が足す）。
//   描く物は DOM の小さな印だけ（3D の形・材質を増やさない）。印の位置は毎コマ、カメラで画面へ写す（fog_view.js の印と同じ作り）。
import { isEn } from '../i18n.js';
export const PINGS = [
  { id: 'attack', shape: 'tri', color: '#e0402e' },     // 攻撃：赤い下向きの三角
  { id: 'defend', shape: 'shield', color: '#3c8ee0' },  // 守れ：青い盾（角の丸い四角）
  { id: 'spot', shape: 'diamond', color: '#f0c040' },   // 敵発見：黄の菱
  { id: 'help', shape: 'plus', color: '#4cc46a' },      // 援護：緑の十字
  { id: 'retreat', shape: 'chev', color: '#d8d0c0' },   // 撤退：白い上向きの山形（戻る向き）
];
const PING = Object.fromEntries(PINGS.map((p) => [p.id, p]));
export const PING_SAME_GAP = 8;   // 同じ合図を出し直せるまでの秒
const LIFE = 6;                   // 印の残る秒
const SVG = {
  tri: (c) => `<svg viewBox="0 0 40 40" width="40" height="40"><path d="M5 8 H35 L20 34 Z" fill="${c}" stroke="#000a" stroke-width="2.5"/></svg>`,
  shield: (c) => `<svg viewBox="0 0 40 40" width="40" height="40"><path d="M8 6 H32 V20 C32 29 26 34 20 36 C14 34 8 29 8 20 Z" fill="${c}" stroke="#000a" stroke-width="2.5"/></svg>`,
  diamond: (c) => `<svg viewBox="0 0 40 40" width="40" height="40"><path d="M20 3 L37 20 L20 37 L3 20 Z" fill="${c}" stroke="#000a" stroke-width="2.5"/><circle cx="20" cy="20" r="5" fill="#000a"/></svg>`,
  plus: (c) => `<svg viewBox="0 0 40 40" width="40" height="40"><path d="M15 4 H25 V15 H36 V25 H25 V36 H15 V25 H4 V15 H15 Z" fill="${c}" stroke="#000a" stroke-width="2.5"/></svg>`,
  chev: (c) => `<svg viewBox="0 0 40 40" width="40" height="40"><path d="M4 26 L20 8 L36 26 L28 32 L20 22 L12 32 Z" fill="${c}" stroke="#000a" stroke-width="2.5"/></svg>`,
};
const CSS = `
.pingm{position:fixed;inset:0;pointer-events:none;z-index:41;overflow:hidden}
.pingm i{position:absolute;left:0;top:0;width:40px;height:40px;margin:-40px 0 0 -20px;will-change:transform}
.pingm i::after{content:'';position:absolute;left:50%;bottom:-6px;width:2px;height:10px;margin-left:-1px;background:#fffc}
.pingm i.foe{filter:drop-shadow(0 0 4px #e0402e)}
@keyframes pingpop{0%{transform:scale(.4)}60%{transform:scale(1.25)}100%{transform:scale(1)}}
.pingm i svg{animation:pingpop .35s ease-out}
@media (prefers-reduced-motion:reduce){.pingm i svg{animation:none}}
.pingbtn{position:fixed;width:48px;height:48px;border-radius:24px;border:2px solid #f0c040;background:rgba(40,30,10,.9);padding:0;z-index:30;pointer-events:auto;display:flex;align-items:center;justify-content:center}
.pingring{position:fixed;inset:0;z-index:42;display:none}
.pingring button{position:absolute;width:52px;height:52px;border-radius:26px;border:1.5px solid #fff6;background:rgba(14,18,24,.88);padding:0;display:flex;align-items:center;justify-content:center}
`;

// 合図の帳（試合ごと）：rt.flags.match.ping
function book(rt) {
  const M = rt?.flags?.match; if (!M) return null;
  return M.ping || (M.ping = { marks: [], last: {}, sent: 0, got: 0, shown: 0, layer: null, net: null, raf: 0 });
}

// 試合の始まりに一度：受けた札を印に。net＝match.js の onlineMatch の口 { send, recv }（無ければ一人で：自分の画面だけ）
export function pingLink(rt, net = null) {
  const P = book(rt); if (!P) return null;
  P.net = net;
  if (net?.recv) net.recv((m) => { if (m && m.k === 'ping' && PING[m.p]) { P.got++; addMark(rt, P, m.p, { x: -m.x, z: -m.z }, true); } });   // 相手の画面の座標は裏返し（26 の合わせと同じ）
  return P;
}

// 合図を出す：at＝地面の点（自分の画面の座標）。同じ合図は 8 秒に一度まで。出せたら true
export function sendPing(rt, id, at) {
  const P = book(rt); if (!P || !PING[id] || !at || !Number.isFinite(at.x) || !Number.isFinite(at.z)) return false;
  const now = rt.t || 0;
  if (P.last[id] != null && now - P.last[id] < PING_SAME_GAP) return false;
  P.last[id] = now;
  addMark(rt, P, id, at, false);
  if (P.net?.send) { try { P.net.send({ k: 'ping', p: id, x: Math.round(at.x * 10) / 10, z: Math.round(at.z * 10) / 10 }); P.sent++; } catch (e) { /* 切れていても自分の画面には出す */ } }
  return true;
}

function addMark(rt, P, id, at, foe) {
  if (typeof document === 'undefined') return;
  layer(P);
  const el = document.createElement('i'); el.className = foe ? 'foe' : ''; el.innerHTML = SVG[PING[id].shape](PING[id].color);
  P.layer.appendChild(el);
  P.marks.push({ id, at: { x: at.x, z: at.z }, until: (rt.t || 0) + LIFE, el });
  P.shown++;
  try { rt.army?.play?.('horagai', { x: at.x, y: 0, z: at.z }, 0.7); } catch (e) { /* 音が無くても印は出す */ }
  if (!P.raf) tick(rt, P);
}
function layer(P) {
  if (P.layer && P.layer.isConnected) return;
  if (!document.getElementById('ping-css')) { const st = document.createElement('style'); st.id = 'ping-css'; st.textContent = CSS; document.head.appendChild(st); }
  P.layer = document.createElement('div'); P.layer.className = 'pingm'; P.layer.setAttribute('aria-hidden', 'true');
  document.body.appendChild(P.layer);
}
// 印を毎コマ地面の点から画面へ写す。試合が終われば片付ける
function tick(rt, P) {
  const step = () => {
    const M = rt.flags?.match;
    if (!M || M.over || !P.layer?.isConnected) { pingDispose(rt); return; }
    const cam = rt.camera, now = rt.t || 0;
    const el0 = rt.game?.renderer?.domElement || document.querySelector('canvas');
    const r = el0?.getBoundingClientRect?.() || { left: 0, top: 0, width: innerWidth, height: innerHeight };
    for (let i = P.marks.length - 1; i >= 0; i--) {
      const m = P.marks[i];
      if (now > m.until) { m.el.remove(); P.marks.splice(i, 1); continue; }
      if (!cam) continue;
      const V = cam.position.constructor, w = new V(m.at.x, (rt.world?.heightAt?.(m.at.x, m.at.z) || 0) + 2, m.at.z);
      cam.updateMatrixWorld?.();
      const ahead = w.clone().applyMatrix4(cam.matrixWorldInverse).z < -1, q = w.project(cam);
      if (!ahead || Math.abs(q.x) > 1.05 || Math.abs(q.y) > 1.05) { m.el.style.display = 'none'; continue; }
      m.el.style.display = '';
      m.el.style.transform = `translate(${Math.round(r.left + (q.x + 1) / 2 * r.width)}px,${Math.round(r.top + (1 - q.y) / 2 * r.height)}px)`;
    }
    P.raf = P.marks.length ? requestAnimationFrame(step) : 0;
  };
  P.raf = requestAnimationFrame(step);
}
export function pingDispose(rt) {
  const P = rt?.flags?.match?.ping; if (!P) return;
  try { cancelAnimationFrame(P.raf); } catch (e) { /* 無ければよい */ }
  P.raf = 0; for (const m of P.marks) m.el.remove(); P.marks.length = 0;
  P.layer?.remove(); P.layer = null;
  P.btn?.remove(); P.ring?.remove(); P.btn = P.ring = null;
}

// 押し所：右下の丸い釦一つ → 五つの合図の輪 → 選ぶと画面の真ん中の地面に置く（押せる所 48〜52px・間 8px 以上）
export function mountPingButton(rt, { doc = document } = {}) {
  const P = book(rt); if (!P || typeof doc === 'undefined') return null;
  layer(P);
  const btn = doc.createElement('button'); btn.type = 'button'; btn.className = 'pingbtn'; btn.id = 'ping-btn';
  btn.setAttribute('aria-label', isEn() ? 'Signal' : '合図'); btn.innerHTML = SVG.diamond('#f0c040').replace('width="40" height="40"', 'width="28" height="28"');
  // 右下（武将の札の列の右・小さな地図と時の札の下）。左は任務の札・持ち替えの釦・号令の輪の釦で埋まっている（iPhone 横 874×402 の写真で重なった）
  btn.style.right = 'max(14px, env(safe-area-inset-right))'; btn.style.bottom = 'calc(max(18px, env(safe-area-inset-bottom)) + 104px)';   // 11/28 cloud-05：右下の隅は『突く』の大きな丸の下に隠れて押せなかった（874×402 の写真）。その丸の上へ上げる
  const ring = doc.createElement('div'); ring.className = 'pingring';
  const close = () => { ring.style.display = 'none'; };
  ring.addEventListener('pointerdown', (e) => { if (e.target === ring) close(); });
  PINGS.forEach((p, i) => {
    const b = doc.createElement('button'); b.type = 'button'; b.dataset.ping = p.id;
    b.setAttribute('aria-label', (isEn() ? { attack: 'Attack', defend: 'Defend', spot: 'Enemy spotted', help: 'Support', retreat: 'Retreat' } : { attack: '攻撃', defend: '守れ', spot: '敵発見', help: '援護', retreat: '撤退' })[p.id]);
    b.innerHTML = SVG[p.shape](p.color).replace('width="40" height="40"', 'width="32" height="32"');
    b.addEventListener('click', (e) => { e.stopPropagation(); close(); sendPing(rt, p.id, centerGround(rt)); });
    b._i = i; ring.appendChild(b);
  });
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (ring.style.display === 'block') { close(); return; }
    const r = btn.getBoundingClientRect(), R = 62, cx = r.left - R - 20, cy = Math.max(R + 34, r.top - 30);   // 輪は釦の左上へ開く（画面の外へ出さない）
    for (const b of ring.children) { const a = -Math.PI / 2 + b._i * 2 * Math.PI / PINGS.length; b.style.left = `${Math.round(cx + Math.cos(a) * R - 26)}px`; b.style.top = `${Math.round(cy + Math.sin(a) * R - 26)}px`; }
    ring.style.display = 'block';
  });
  doc.body.appendChild(ring); doc.body.appendChild(btn);
  // 11/28 cloud-05（hud_fit）：右の丸（touch.js #tc .tb）は画面の大きさで高さが変わる（iPad で『突く』の丸に 8px 重なった）。一秒に一度、真下の丸の上へ 8px 空けて置く
  const fit = () => {
    if (!btn.isConnected) { clearInterval(fitT); return; }
    const r = btn.getBoundingClientRect(); let top = Infinity;
    for (const t of doc.querySelectorAll('#tc .tb')) { const q = t.getBoundingClientRect(); if (q.width && q.left < r.right && q.right > r.left && q.top > r.top - 60 && getComputedStyle(t).visibility !== 'hidden') top = Math.min(top, q.top); }
    const want = top < Infinity ? Math.max(122, Math.round(innerHeight - top + 8)) : null;
    if (want && Math.abs(want - (innerHeight - r.bottom)) > 1) btn.style.bottom = want + 'px';
  };
  const fitT = setInterval(fit, 1000); setTimeout(fit, 50);
  P.btn = btn; P.ring = ring;
  return btn;
}
// 画面の真ん中の地面（y=0 の面。模擬合戦の地図は起伏が小さい）。カメラが無ければ自分の大将の所
export function centerGround(rt) {
  const cam = rt.camera;
  if (cam?.getWorldDirection) {
    const o = cam.position, d = cam.getWorldDirection(o.clone());
    if (d.y < -0.05) { const k = -o.y / d.y; return { x: o.x + d.x * k, z: o.z + d.z * k }; }
  }
  const p = rt.player?.u?.pos; return p ? { x: p.x, z: p.z } : { x: 0, z: 0 };
}
export function pingStats(rt) { const P = rt?.flags?.match?.ping; return P ? { sent: P.sent, got: P.got, shown: P.shown, live: P.marks.length } : null; }
