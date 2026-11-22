// 討死の引き継ぎで「どの武将を動かすか」を選ぶ札（K585 final 18「残りの武将から1人を選んで引き継ぐ」）。
//   36 の受け持ちだった残り（今は一番近い武将へ自動）を、司令塔の振りで 48 が作った（11/21・18 と 36 に断り済）。
//   字は名だけ。生きている味方の武将の顔を下に並べ、押した武将へ移る。時は止めない：選ぶ間は本人を倒させず（match.js が守る）、
//   五秒の輪が尽きたら一番近い武将（金に光る札）へ自動で移る。押せる所は 64px の顔（44px 以上）。
import { face, bushoOf, RARITY, lbl } from './house.js';

const CSS = `
.oltk{position:fixed;left:0;right:0;bottom:max(14px,env(safe-area-inset-bottom));z-index:9500;display:flex;justify-content:center;gap:14px;pointer-events:none}
.oltk button{pointer-events:auto;position:relative;width:76px;min-height:96px;display:flex;flex-direction:column;align-items:center;gap:4px;padding:6px 2px;border:1px solid #c2a25a;border-radius:8px;background:#14120fe6;color:#ece4d2;font:inherit;cursor:pointer;touch-action:manipulation}
.oltk button.near{box-shadow:0 0 0 2px #f4d98a,0 0 18px 4px rgba(244,217,138,.55)}
.oltk .f{width:56px;height:56px;border-radius:50%;overflow:hidden;display:grid;place-items:center;background:#2a241c;border:3px solid var(--rc,#6a5a3a)}
.oltk .f img{width:100%;height:100%;object-fit:cover;object-position:50% 20%}
.oltk .n{font-size:12px;line-height:1.2;text-align:center}
.oltk .t{position:absolute;inset:-4px;border-radius:10px;pointer-events:none;background:conic-gradient(#d9b45a var(--p,100%),transparent 0);-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude;padding:3px}
@media (prefers-reduced-motion:reduce){.oltk .t{display:none}}
`;

// cands：[{ name, u }]（近い順。先頭が自動で移る相手）。onPick(c) を一度だけ呼ぶ。戻り値は片付ける関数
export function openTakeoverPick(cands, onPick, { secs = 5 } = {}) {
  document.querySelector('.oltk')?.remove();
  if (!document.getElementById('oltk-css')) { const s = document.createElement('style'); s.id = 'oltk-css'; s.textContent = CSS; document.head.appendChild(s); }
  const el = document.createElement('div'); el.className = 'oltk'; el.setAttribute('role', 'group'); el.setAttribute('aria-label', lbl('引き継ぐ武将'));
  let done = false;
  const finish = (c) => { if (done) return; done = true; clearInterval(tick); el.remove(); onPick(c); };
  cands.forEach((c, i) => {
    const b = document.createElement('button'); b.type = 'button'; if (i === 0) b.className = 'near';
    const r = bushoOf(c.name)?.rare;
    b.setAttribute('aria-label', lbl(c.name));
    b.innerHTML = `<span class="f" style="--rc:${r ? RARITY[r].color : '#6a5a3a'}"></span><span class="n"></span>${i === 0 ? '<i class="t" aria-hidden="true"></i>' : ''}`;
    b.querySelector('.n').textContent = c.name;
    face(b.querySelector('.f'), c.name);
    b.addEventListener('pointerdown', (e) => { if (e.button) return; e.preventDefault(); finish(c); });
    b.addEventListener('click', () => finish(c));
    el.appendChild(b);
  });
  document.body.appendChild(el);
  const t0 = performance.now(), ring = el.querySelector('.t');
  const tick = setInterval(() => {
    const left = Math.max(0, 1 - (performance.now() - t0) / (secs * 1000));
    if (ring) ring.style.setProperty('--p', `${Math.round(left * 100)}%`);
    if (left <= 0) finish(cands[0]);
  }, 100);
  return () => { done = true; clearInterval(tick); el.remove(); };
}
