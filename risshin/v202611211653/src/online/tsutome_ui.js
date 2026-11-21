// 毎日の務めの札（33・11/21）。openTsutome(root, { save, onSave, onClose })。登用の間と同じ見た目の続き。押せる所は 44px・間 8px。
import { today, claim } from './tsutome.js';

const CSS = `
.tsu{position:fixed;inset:0;z-index:9002;display:flex;align-items:center;justify-content:center;background:#0b0806e8;color:#f1e9d6;font:15px/1.45 "Noto Serif JP","Hiragino Mincho ProN",serif;
  padding:max(8px,env(safe-area-inset-top)) max(16px,env(safe-area-inset-right)) max(8px,env(safe-area-inset-bottom)) max(16px,env(safe-area-inset-left));box-sizing:border-box}
.tsu *{box-sizing:border-box}
.tsu-box{width:min(560px,100%);max-height:100%;overflow:auto;background:#1c1813;border:1px solid #8a7350;border-radius:6px;padding:10px 14px}
.tsu h2{margin:0 0 6px;font-size:19px;color:#e8c77a;font-weight:600}
.tsu-row{display:flex;align-items:center;gap:8px;padding:6px 0;border-top:1px solid #3a2f22}
.tsu-row:first-of-type{border-top:0}
.tsu-t{flex:1;min-width:0}
.tsu-bar{height:6px;background:#0008;border-radius:3px;margin-top:4px;overflow:hidden}
.tsu-bar i{display:block;height:100%;background:#c9a24a}
.tsu small{font-size:13px;opacity:.85}
.tsu button{font:inherit;color:inherit;min-height:44px;min-width:96px;border-radius:4px;cursor:pointer;border:1px solid #e8c77a;background:#5a1f17;padding:4px 10px}
.tsu button:disabled{opacity:.45;cursor:default;background:#0006;border-color:#8a7350}
.tsu-foot{display:flex;justify-content:center;margin-top:8px}
.tsu-foot button{background:#0007;border-color:#8a7350;min-width:160px}
`;
const rewardText = (r) => (r.kin ? `小判 ${r.kin}` : `武将印 ${r.seals}`);

export function openTsutome(root, o = {}) {
  const save = o.save || {};
  if (!document.getElementById('tsu-css')) { const s = document.createElement('style'); s.id = 'tsu-css'; s.textContent = CSS; document.head.appendChild(s); }
  const el = document.createElement('div'); el.className = 'tsu'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', '今日の務め');
  root.appendChild(el);
  const draw = (msg = '') => {
    const list = today(save);
    el.innerHTML = `<div class="tsu-box"><h2>今日の務め</h2>
      ${list.map((x) => `<div class="tsu-row"><div class="tsu-t">${x.name}　<small>${x.prog}／${x.need}</small><br><small>${rewardText(x.reward)}</small>
        <div class="tsu-bar" aria-hidden="true"><i style="width:${Math.round(100 * x.prog / x.need)}%"></i></div></div>
        <button data-id="${x.id}" ${x.done && !x.got ? '' : 'disabled'}>${x.got ? '受け取った' : '受け取る'}</button></div>`).join('')}
      ${msg ? `<p role="status" style="margin:6px 0 0;color:#f3d68a">${msg}</p>` : ''}
      <div class="tsu-foot"><button data-a="close">閉じる</button></div></div>`;
  };
  el.onclick = (e) => {
    const b = e.target.closest('button'); if (!b || b.disabled) return;
    if (b.dataset.a === 'close') { el.remove(); o.onClose && o.onClose(); return; }
    const r = claim(save, b.dataset.id);
    if (r) { try { o.onSave && o.onSave(save); } catch (err) { /* 持てなくても画面は進む */ } }
    draw(r ? `${rewardText(r)}を受け取った` : '');
  };
  draw();
  return { el, close: () => el.remove() };
}
