// 戦の制限時間（kaito 10/29）：上に減っていく棒と残りの時計。時間切れは戦ごとの負け方（逃げ切られる等）を少し見せて負け。
// 今は稲生だけ（kaito：ほかの戦は稲生を見てから）。ほかの戦で使う時は下の表に一行足す。
// 表の一行：{ sec（秒）, text（負けの一行）, who（逃げる敵の名。無ければ見せ場なし）, away（逃げる向き。無ければ自分から離れる向き） }
import { S } from './settings.js';

const TABLE = {
  inou: { sec: 480, text: '逃げられた', who: '林美作守', away: { x: 0, z: -1 } },
};

export const timeLimitOf = (rt) => (rt && !rt.def.dojo && !rt.def.town && !rt.G?.lord && TABLE[rt.def.key]) || null;

let bar = null;
function ensureBar() {
  if (bar && bar.isConnected) return bar;
  if (!document.getElementById('tl-css')) {
    const st = document.createElement('style'); st.id = 'tl-css';
    st.textContent = `#tl-bar{position:fixed;left:50%;top:calc(30px + env(safe-area-inset-top,0px));transform:translateX(-50%);display:flex;align-items:center;gap:6px;pointer-events:none;z-index:6;font:600 12px/1 system-ui,sans-serif;color:#ece4d2;text-shadow:0 1px 2px #000}
#tl-bar .tl-t{width:min(160px,22vw);height:5px;border-radius:3px;background:rgba(20,18,15,.55);box-shadow:0 0 0 1px rgba(0,0,0,.4);overflow:hidden}
#tl-bar .tl-t i{display:block;height:100%;background:#e8dcc0;transform-origin:left center}
#tl-bar.warn .tl-t i{background:#e0a030}#tl-bar.warn b{color:#f0c060}
#tl-bar.crit .tl-t i{background:#d8402c}#tl-bar.crit b{color:#ff8a70}
#tl-bar.crit.blink{animation:tlb 1s steps(2) infinite}@keyframes tlb{50%{opacity:.45}}
#tl-bar b{min-width:34px;font-variant-numeric:tabular-nums}`;
    document.head.appendChild(st);
  }
  bar = document.createElement('div'); bar.id = 'tl-bar'; bar.setAttribute('aria-hidden', 'true');
  bar.innerHTML = '<span class="tl-t"><i></i></span><b></b>';
  document.body.appendChild(bar);
  return bar;
}
export function timeLimitHide() { if (bar) { bar.remove(); bar = null; } }

// 毎コマ（battle.js の update から）。dt は筋書きの時計（溜め・手ほどきの間は止まる）
export function timeLimitTick(rt, dt) {
  const T = timeLimitOf(rt);
  if (!T) return;
  const L = rt.timeLimit || (rt.timeLimit = { left: T.sec, shown: '' });
  if (rt.over || rt.ended || rt.tracker?.main === true) { timeLimitHide(); return; }
  if (L.up) return timeUpScene(rt, T, L, dt);
  if (!rt.choice) L.left -= dt;
  const el = ensureBar();
  const left = Math.max(0, L.left), k = left / T.sec;
  const s = `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`;
  if (s !== L.shown) {
    L.shown = s; el.lastChild.textContent = s;
    el.firstChild.firstChild.style.transform = `scaleX(${k.toFixed(3)})`;
    el.classList.toggle('warn', left <= 90 && left > 30);
    el.classList.toggle('crit', left <= 30);
    el.classList.toggle('blink', left <= 30 && !S.reduceMotion);
  }
  if (left <= 0) { L.up = true; L.sceneT = 0; timeLimitHide(); }
}

// 時間切れ：逃げる敵を背から見せ、一行を出して負けにする
function timeUpScene(rt, T, L, dt) {
  if (!L.started) {
    L.started = true;
    const p = rt.player.u;
    const u = T.who && rt.army.units.find((o) => o.alive && o.team !== p.team && o.name === T.who);
    L.u = u || null;
    if (u) {
      let ax = T.away?.x ?? u.pos.x - p.pos.x, az = T.away?.z ?? u.pos.z - p.pos.z; const n = Math.hypot(ax, az) || 1; ax /= n; az /= n;
      // 隊ごと奥へ退かせる（備の下知で走らせる。兵は斬り合いを止める）
      const g = u.group;
      if (g) { g.anchor.x = u.pos.x; g.anchor.z = u.pos.z; }
      if (g) L.run = { g, dest: { x: u.pos.x + ax * 80, z: u.pos.z + az * 80 } };
      for (const o of [u, ...(g?.units || [])]) {
        if (!o.alive) continue;
        o.invuln = true; o.target = null; o.atk = null; o.swing = null; o.bind = null;
        if (!g) { o.fleeing = true; o.fleeT = rt.army.time ?? rt.t; o.moraleFleeDir = { x: ax, z: az }; }
      }
    }
    p.invuln = true;
    rt.banner(T.text, '');
  }
  L.sceneT += dt;
  // 戦の筋書きが下知を替えても、見せ場の間は毎コマ退きの下知に戻す
  const R = L.run;
  if (R) { const g = R.g; g.noAI = false; g.fixed = false; g.stay = false; g.guard = false; g.order = 'retreat'; g.dest = R.dest; g.speed = 4; g.signalUntil = 0; g.aggro = 0; g.fire = false; g.focus = null; g.onArrive = null; }
  if (L.u && !S.reduceMotion) rt.player.cine = { x: L.u.pos.x, z: L.u.pos.z, t: 0.5, encounter: true };
  if (L.sceneT >= (L.u ? 6 : 2.5) && !L.done) {
    L.done = true;
    rt.tracker.main = false;
    rt.finish({ failureReason: T.text, timeUp: true, scriptedEnd: true }, 3);
  }
}
