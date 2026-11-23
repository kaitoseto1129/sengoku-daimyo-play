// 称号の置き場（K603）：諸大名ごとの 初勝利・挑戦 と、得た称号・旗の一覧。openTitles(onClose) で画面の上に開く。
//   入口は「諸大名と戦う」の家選び（taisen_ui.js・k592）や軍団の画面から。家選びの札の小さな印は npc_reward.js の houseHonors(save, house)。
import { NPC_HOUSES, FIRST_KOBAN, challengeOf, houseHonors, titlesOf } from './npc_reward.js';
import { loadOnline } from './house.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const CSS = `
.nt{position:fixed;inset:0;z-index:9100;background:radial-gradient(120% 90% at 50% 0%,#2a2016,#0e0b08 70%);color:#ece4d2;display:flex;flex-direction:column;
  padding:max(8px,env(safe-area-inset-top)) max(16px,env(safe-area-inset-right)) max(8px,env(safe-area-inset-bottom)) max(16px,env(safe-area-inset-left));box-sizing:border-box;font:15px/1.45 "Noto Serif JP","Hiragino Mincho ProN",serif}
.nt *{box-sizing:border-box}.nt button{font:inherit;color:inherit;cursor:pointer;min-height:44px;border-radius:4px}
.nt-top{display:flex;align-items:center;gap:10px;flex:none;min-height:48px}
.nt-top h2{margin:0;font-size:19px;letter-spacing:.2em;color:#d9b45a;font-weight:600}
.nt-top .nt-x{min-width:44px;background:#14120fcc;border:1px solid #c2a25a}
.nt-top .nt-n{margin-left:auto;font-size:14px;color:#c9b98f}
.nt-list{flex:1;overflow-y:auto;display:flex;flex-wrap:wrap;gap:8px;align-content:flex-start;padding:6px 0}
.nt-h{flex:1 1 250px;border:1px solid #5a4a32;border-radius:6px;background:#17130ecc;padding:8px 10px;display:flex;flex-direction:column;gap:4px}
.nt-h b{font-size:16px}
.nt-row{display:flex;gap:8px;align-items:baseline;font-size:13.5px;color:#c9b98f}
.nt-row i{font-style:normal;flex:none;width:1.3em;text-align:center;color:#6a5a3a}
.nt-row.ok i{color:#f3d68a}.nt-row.ok{color:#ece4d2}
.nt-row small{color:#a8987a}
`;
export function openTitles(onClose) {
  const save = loadOnline() || {};
  if (!document.getElementById('nt-css')) { const st = document.createElement('style'); st.id = 'nt-css'; st.textContent = CSS; document.head.appendChild(st); }
  const el = document.createElement('div'); el.className = 'nt'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', '称号');
  const got = titlesOf(save);
  el.innerHTML = `<div class="nt-top"><button type="button" class="nt-x" aria-label="戻る">‹</button><h2>称号</h2><span class="nt-n">得た称号 ${got.length}</span></div>
    <div class="nt-list">${Object.entries(NPC_HOUSES).map(([k, H]) => {
      const h = houseHonors(save, k), c = challengeOf(k);
      return `<div class="nt-h"><b>${esc(H.name)}家</b>
        <div class="nt-row${h.first ? ' ok' : ''}"><i>${h.first ? '●' : '○'}</i><span>初勝利　称号「${esc(H.title)}」<small>・小判 ${FIRST_KOBAN}</small></span></div>
        <div class="nt-row${h.chal ? ' ok' : ''}"><i>${h.chal ? '●' : '○'}</i><span>挑戦「${esc(c.name)}」<small>・銭 ${c.zeni}・称号「${esc(c.title)}」・旗</small></span></div></div>`;
    }).join('')}</div>`;
  document.body.appendChild(el);
  const close = () => { el.remove(); onClose && onClose(); };
  el.querySelector('.nt-x').addEventListener('click', close);
  el.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); close(); } });
  el.querySelector('.nt-x').focus({ preventScroll: true });
  return close;
}
