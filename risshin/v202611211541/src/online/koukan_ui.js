// 交換所の画面（K587・33・11/21 クラウド k365-cloud-33）。重なった武将から貯まった武将印で、持っていない武将を一人選んで登用する。
//   openKoukan(root, o)。o：{ state（27 の toyo state。owned・seals を使う）, onSave(state), onClose(), onTrial(id)（模擬合戦で試す。無ければ札を出さない） }
//   値段：A＝50・S＝150・SS＝400（busho_bank.js の EXCHANGE_COST）。SS は state.ssOpen の日か、SS の重複4回の札（ssPass）がある時だけ並べる。取り消せないので、使う前に確かめの札を出す。
//   見た目は登用の間（toyo_screen.js）の CSS を借りる（同じ間の続きに見せる）。
import { exchangeList, exchange } from './busho_bank.js';
import { BUSHOU_BY_ID, HOUSE_NAME } from './bushou_online.js';

const MARK = { N: '○', R: '◇', A: '◆', S: '★', SS: '★★' };
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const CSS = `
.koukan{position:fixed;inset:0;z-index:9001;color:#f1e9d6;font:15px/1.45 "Noto Serif JP","Hiragino Mincho ProN",serif;background:radial-gradient(ellipse at 50% 35%,#2c2a1c 0%,#100e0a 70%);display:flex;flex-direction:column;
  padding:max(8px,env(safe-area-inset-top)) max(16px,env(safe-area-inset-right)) max(8px,env(safe-area-inset-bottom)) max(16px,env(safe-area-inset-left));box-sizing:border-box;overflow:hidden}
.koukan *{box-sizing:border-box}
.koukan button{font:inherit;color:inherit;min-height:44px;cursor:pointer;border-radius:4px}
.kk-top{display:flex;align-items:center;gap:8px;flex:none}
.kk-top h1{font-size:20px;margin:0 auto 0 0;color:#e8c77a;font-weight:600}
.kk-chip{padding:6px 12px;background:#0007;border:1px solid #8a7350;border-radius:22px;white-space:nowrap}
.kk-x{min-width:44px;background:#0007;border:1px solid #8a7350}
.kk-scroll{flex:1;overflow:auto;min-height:0;margin:8px 0;-webkit-overflow-scrolling:touch}
.kk-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(168px,1fr));gap:8px}
.kk-card{border:1px solid #8a7350;background:#0006;border-radius:4px;padding:8px 10px;display:flex;flex-direction:column;gap:6px}
.kk-card.ok{border-color:#e8c77a;background:#3a2414aa}
.kk-card b{font-size:17px}
.kk-card small{font-size:13px;opacity:.85}
.kk-row{display:flex;gap:8px}
.kk-get{flex:1;border:1px solid #e8c77a;background:#5a1f17;padding:4px 8px}
.kk-get:disabled{opacity:.45;cursor:default;background:#0006;border-color:#8a7350}
.kk-try{min-width:64px;border:1px solid #8a7350;background:#0007;padding:4px 8px}
.kk-note{font-size:13px;opacity:.85;margin:4px 0;flex:none}
.kk-ov{position:absolute;inset:0;background:#0b0806f2;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:16px;z-index:2;text-align:center}
.kk-ov p{font-size:16px;margin:0;max-width:560px}
.kk-foot{display:flex;gap:8px;justify-content:center;flex-wrap:wrap}
.kk-foot button{min-width:180px;border:1px solid #e8c77a;background:#5a1f17;padding:6px 14px}
.kk-foot button.sec{background:#0007;border-color:#8a7350}
@media (prefers-reduced-motion: reduce){.koukan *{transition:none!important;animation:none!important}}
`;

export function openKoukan(root, o = {}) {
  const st = o.state || { owned: {}, seals: 0 };
  st.owned = st.owned || {}; st.seals = st.seals || 0;
  if (!document.getElementById('koukan-css')) { const s = document.createElement('style'); s.id = 'koukan-css'; s.textContent = CSS; document.head.appendChild(s); }
  const el = document.createElement('div'); el.className = 'koukan'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', '交換所');
  root.appendChild(el);
  const close = () => { el.remove(); o.onClose && o.onClose(); };

  const list = () => {
    const rows = exchangeList(st).sort((a, b) => b.cost - a.cost || (b.affordable - a.affordable));
    el.innerHTML = `<div class="kk-top"><h1>交換所</h1><span class="kk-chip">武将印 ${st.seals}</span><button class="kk-x" data-a="close" aria-label="閉じる">✕</button></div>
      <div class="kk-note">重なって登用した武将は武将印になります。武将印で、持っていない武将を一人選んで登用できます。</div>
      <div class="kk-scroll">${rows.length ? `<div class="kk-grid">${rows.map((r) => `<div class="kk-card ${r.affordable ? 'ok' : ''}">
        <span>${MARK[r.rarity]} ${r.rarity}　<small>${HOUSE_NAME[r.house] || ''}</small></span><b>${esc(r.name)}</b>
        <div data-busho-art="${esc(r.name)}"></div>
        <div class="kk-row"><button class="kk-get" data-a="get" data-id="${r.id}" ${r.affordable ? '' : 'disabled'}>武将印 ${r.cost} で登用する${r.affordable ? '' : `<br><small>あと ${r.cost - st.seals}</small>`}</button>
        ${o.onTrial ? `<button class="kk-try" data-a="try" data-id="${r.id}" aria-label="${esc(r.name)}を模擬合戦で試す">試す</button>` : ''}</div></div>`).join('')}</div>`
        : '<div class="kk-note">交換できる武将はいません。持っていない武将が増えると、ここに並びます。</div>'}</div>`;
    import('../bushou_card_art.js').then((A) => A.fillCardArt(el)).catch(() => {});   // 11/21 K586：その人の家紋と旗印
    el.onclick = (e) => {
      const b = e.target.closest('[data-a]'); if (!b || b.disabled) return;
      if (b.dataset.a === 'close') return close();
      if (b.dataset.a === 'get') return confirm(b.dataset.id);
      if (b.dataset.a === 'try') { el.remove(); o.onTrial(b.dataset.id); }
    };
  };

  // 取り消せない操作なので、その場で確かめる
  const confirm = (id) => {
    const bu = BUSHOU_BY_ID[id]; const r = exchangeList(st).find((q) => q.id === id);
    if (!bu || !r) return list();
    el.insertAdjacentHTML('beforeend', `<div class="kk-ov" role="alertdialog" aria-label="交換の確かめ"><p><b>${esc(bu.name)}</b><br>武将印 ${r.cost} を使って登用します。<br>使った武将印は戻りません。</p>
      <div class="kk-foot"><button data-a="yes">武将印 ${r.cost} を使って登用する</button><button class="sec" data-a="no">使わずに戻る</button></div></div>`);
    el.onclick = (e) => {
      const b = e.target.closest('[data-a]'); if (!b) return;
      if (b.dataset.a !== 'yes') return list();
      const res = exchange(st, undefined, id);
      if (!res.ok) return list();
      try { o.onSave && o.onSave(st); } catch (err) { /* 持てなくても画面は進む */ }
      done(bu);
    };
  };

  const done = (bu) => {
    el.querySelector('.kk-ov')?.remove();
    el.insertAdjacentHTML('beforeend', `<div class="kk-ov"><p>登用した</p><p>${MARK[bu.rank]} ${bu.rank}<br><b style="font-size:22px;color:#e8c77a">${esc(bu.name)}</b><br>${HOUSE_NAME[bu.house] || ''}・コスト${bu.cost}</p>
      <div class="kk-foot"><button data-a="back">交換所へ戻る</button></div></div>`);
    el.onclick = (e) => { if (e.target.closest('[data-a="back"]')) list(); };
  };

  list();
  return { el, close };
}
