// K639 ⑥（kaito 11/22「一般の戦も諸大名戦と同じ形に」）：一般の戦の下中央に、名のある味方の隊の札（名と今の人数の棒）を小さく並べる。
//   諸大名戦（online/match_hud.js）の出陣武将の札と同じ形。字は隊の名と人数だけ。0.5 秒に一度だけ DOM を書き換える（描く回数は増やさない）。
//   隊＝rt.army.groups の味方（team 0）で名のある物。人数＝生きている兵／初めの兵（g.initial）。多い順に四つまで。
import { isEn, tr } from './i18n.js';
let root = null, rtOf = null;
const CSS = `
.bcards{position:fixed;left:50%;bottom:6px;transform:translateX(-50%);display:flex;gap:4px;pointer-events:none;z-index:9;font:600 12px/1.2 "Noto Serif JP","Hiragino Mincho ProN",serif;color:#f4ecd8;text-shadow:0 0 3px #000,0 0 6px #000}
.bcards .bc{width:80px;padding:3px 5px 4px;border-radius:6px;background:rgba(14,18,24,.72);border:1.5px solid #fff4}
.bcards .bc b{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:12px;font-weight:600}
.bcards .bc u{display:block;height:6px;margin-top:3px;background:#0008;border:1px solid #fff3;border-radius:3px;overflow:hidden;text-decoration:none}
.bcards .bc i{display:block;height:100%;background:#6fb3ff}
.bcards .bc.low{border-color:#f2a03a}.bcards .bc.low i{background:#f2a03a}
.bcards .bc.out{opacity:.4}
.bcards .bc em{display:block;font-style:normal;font-size:11px;opacity:.9}
@media (max-width:760px){.bcards{display:none}}
`;
export function updateTeamCards(rt) {
  if (typeof document === 'undefined') return;
  const gs = (rt?.army?.groups || []).filter((g) => g.team === 0 && g.name && g.name !== 'player' && !g.isPlayerSquad && (g.initial || 0) >= 4);
  if (!gs.length) return clearTeamCards();
  if (!document.getElementById('bcards-css')) { const st = document.createElement('style'); st.id = 'bcards-css'; st.textContent = CSS; document.head.appendChild(st); }
  if (!root || !root.isConnected || rtOf !== rt) { clearTeamCards(); root = document.createElement('div'); root.className = 'bcards'; root.setAttribute('aria-hidden', 'true'); document.body.appendChild(root); rtOf = rt; }
  const rows = gs.map((g) => ({ g, n: g.units.filter((u) => u.alive).length })).sort((a, b) => (b.g.initial || 0) - (a.g.initial || 0)).slice(0, 4);
  const key = rows.map((r) => r.g.name + r.n).join('|');
  if (root.dataset.k === key) return; root.dataset.k = key;
  root.innerHTML = rows.map((r) => { const f = Math.max(0, Math.min(1, r.n / Math.max(1, r.g.initial))); return `<div class="bc${f <= 0.3 ? ' low' : ''}${r.n <= 0 ? ' out' : ''}"><b>${(isEn() ? tr(r.g.name) : r.g.name).replace(/[<>&]/g, '')}</b><u><i style="width:${Math.round(f * 100)}%"></i></u><em>${r.n}</em></div>`; }).join('');
}
export function clearTeamCards() { if (root) { try { root.remove(); } catch (e) { /* 無ければよい */ } } root = null; rtOf = null; }
