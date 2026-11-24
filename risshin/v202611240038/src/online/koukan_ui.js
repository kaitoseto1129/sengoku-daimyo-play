// 交換所の画面（K587・33・11/21 クラウド k365-cloud-33。K600 51〜53・93 で外観・旗の品と絵を足した＝iMac 11/21）。重なった武将から貯まった武将印で、持っていない武将を一人選んで登用する。
//   openKoukan(root, o)。o：{ state（27 の toyo state。owned・seals を使う）, onSave(state), onClose(), onTrial(id)（模擬合戦で試す。無ければ札を出さない） }
//   値段：SR＝90・SSR＝400（busho_bank.js の EXCHANGE_COST・11/24 格を四つに。前は A50・S150・SS400）。SSR は state.ssOpen の日か、SSR の重複4回の札（ssPass）がある時だけ並べる。取り消せないので、使う前に確かめの札を出す。
//   見た目は登用の間（toyo_screen.js）の CSS を借りる（同じ間の続きに見せる）。
import { exchangeList, exchange, goodsList, exchangeGoods, GOODS_KIND } from './busho_bank.js';
import { BUSHOU_BY_ID, HOUSE_NAME } from './bushou_online.js';
import { houseTag, fillHouse, armChip, armOf, ensureHouseCss } from './toyo_screen.js';   // K624②：家紋と家の名・兵種を、登用の札と同じ作りで

const MARK = { N: '', R: '', SR: '', SSR: '' };   // K608：印は使わず、格は字と札の枠の色で
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
.kk-card.ok{background:#3a2414aa}
.kk-card{border-width:3px;border-color:var(--rc,#8a7350)}.kk-card.r-SSR{--rc:#e8c25a}.kk-card.r-SR{--rc:#d9824a}.kk-card.r-A{--rc:#8fb0d8}.kk-card.r-R{--rc:#9fc08a}.kk-card.r-N{--rc:#b8ae9c}
.kk-card .kk-rk{align-self:flex-start;background:var(--rc,#8a7350);color:#1c1408;font:700 13px/1.6 serif;padding:0 8px;border-radius:2px}
.kk-bd{height:120px;display:flex;justify-content:center;align-items:flex-end;overflow:hidden;background:radial-gradient(ellipse at 50% 80%,#fff2 0,#0000 70%)}.kk-bd img{height:100%;max-height:none!important}
.kk-card b{font-size:17px}
.kk-card small{font-size:13px;opacity:.85}
.kk-row{display:flex;gap:8px}
.kk-get{flex:1;border:1px solid #e8c77a;background:#5a1f17;padding:4px 8px}
.kk-get:disabled{opacity:.45;cursor:default;background:#0006;border-color:#8a7350}
.kk-try{min-width:64px;border:1px solid #8a7350;background:#0007;padding:4px 8px}
.kk-fs{display:flex;flex-wrap:nowrap;overflow-x:auto;gap:5px;margin:3px 0;padding-bottom:2px}.kk-f{flex:none;min-height:44px;white-space:nowrap;padding:0 12px;background:#2a1c10;color:#f1e9d6;border:1px solid #8a7350;border-radius:4px;font:inherit}.kk-f.on{background:#e8c77a;color:#1c1408;border-color:#e8c77a}
.kk-note{font-size:13px;opacity:.85;margin:4px 0;flex:none}
.kk-h{font-size:16px;color:#e8c77a;margin:10px 0 6px;font-weight:600}
.kk-art{width:100%;height:auto;aspect-ratio:3/2;border-radius:3px;display:block}
.kk-own{font-size:13px;color:#cdbf9f;text-align:center;padding:10px 0}
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

  // 一人用の見た目の品（cosmetics.js）：持っているかと、交換した品を着られるようにする口。読めなければ帳の goods だけで見る
  let C = null;
  import('../cosmetics.js').then((m) => { C = m; if (el.isConnected && !el.querySelector('.kk-ov')) list(); }).catch(() => {});
  const owns = (look) => !!(C && C.owns(look));
  const goodsHtml = () => `<div class="kk-h">外観・旗<small style="font-size:13px;opacity:.8">　見た目だけ。強さは変わらない</small></div><div class="kk-grid">${goodsList(st, owns).map((g) => `<div class="kk-card ${!g.owned && g.affordable ? 'ok' : ''}">
        <span>${GOODS_KIND[g.kind] || ''}</span><b>${esc(g.name)}</b>
        <canvas class="kk-art" data-goods-art="${g.id}" width="150" height="100" aria-hidden="true"></canvas>
        ${g.owned ? '<div class="kk-own">持っている（城下の武具屋で着る）</div>' : `<div class="kk-row"><button class="kk-get" data-a="goods" data-id="${g.id}" ${g.affordable ? '' : 'disabled'}>武将印 ${g.cost} で交換する${g.affordable ? '' : `<br><small>あと ${g.cost - st.seals}</small>`}</button></div>`}</div>`).join('')}</div>`;
  let fh = '', fa = '';   // 絞り込み（家・兵種）
  ensureHouseCss();
  const list = () => {
    const all = exchangeList(st), houses = [...new Set(all.map((r) => r.house))].filter((h) => HOUSE_NAME[h]), arms = ['槍', '騎馬', '鉄砲', '弓'].filter((a) => all.some((r) => armOf(BUSHOU_BY_ID[r.id]) === a));
    const chip = (k, v, label) => `<button class="kk-f${(k === 'h' ? fh : fa) === v ? ' on' : ''}" data-a="kf" data-k="${k}" data-v="${v}" aria-pressed="${(k === 'h' ? fh : fa) === v}">${label}</button>`;
    const rows = all.filter((r) => (!fh || r.house === fh) && (!fa || armOf(BUSHOU_BY_ID[r.id]) === fa)).sort((a, b) => b.cost - a.cost || (b.affordable - a.affordable));
    el.innerHTML = `<div class="kk-top"><h1>交換所</h1><span class="kk-chip">武将印 ${st.seals}</span><button class="kk-x" data-a="close" aria-label="閉じる">✕</button></div>
      <div class="kk-note">重なって登用した武将は武将印になります（SSR は多め）。武将印で、持っていない武将・外観・旗と交換できます。</div>
      <div class="kk-scroll"><div class="kk-h">武将</div><div class="kk-fs" role="group" aria-label="絞り込み">${chip('h', '', '家：全て')}${houses.map((h) => chip('h', h, HOUSE_NAME[h].endsWith('家') ? HOUSE_NAME[h] : `${HOUSE_NAME[h]}家`)).join('')}</div><div class="kk-fs" role="group" aria-label="兵種で絞る">${chip('a', '', '兵種：全て')}${arms.map((a) => chip('a', a, a)).join('')}</div>${rows.length ? `<div class="kk-grid">${rows.map((r) => `<div class="kk-card r-${r.rarity} ${r.affordable ? 'ok' : ''}">
        <span><span class="kk-rk">${r.rarity}</span>　${armChip(BUSHOU_BY_ID[r.id])}</span><span>${houseTag(BUSHOU_BY_ID[r.id], 'sm')}</span><div class="kk-bd" data-busho-body="${esc(r.name)}" aria-hidden="true"></div><b>${esc(r.name)}</b>
        <div data-busho-art="${esc(r.name)}"></div>
        <div class="kk-row"><button class="kk-get" data-a="get" data-id="${r.id}" ${r.affordable ? '' : 'disabled'}>武将印 ${r.cost} で登用する${r.affordable ? '' : `<br><small>あと ${r.cost - st.seals}</small>`}</button>
        ${o.onTrial ? `<button class="kk-try" data-a="try" data-id="${r.id}" aria-label="${esc(r.name)}を模擬合戦で試す">試す</button>` : ''}</div></div>`).join('')}</div>`
        : '<div class="kk-note">交換できる武将はいません。持っていない武将が増えると、ここに並びます。</div>'}${goodsHtml()}</div>`;
    import('./goods_art.js').then((A) => A.fillGoodsArt(el)).catch(() => {});   // 品の絵（k600-ensyutsu が本物の絵に替える口）
    fillHouse(el);
    import('../bushou_card_art.js').then((A) => A.fillCardArt(el)).catch(() => {});   // 11/21 K586：その人の家紋と旗印
    import('./toyo_reveal.js').then((R) => R.fillBodies(el)).catch(() => {});   // K608：その人の全身（3D から撮った絵）
    el.onclick = (e) => {
      const b = e.target.closest('[data-a]'); if (!b || b.disabled) return;
      if (b.dataset.a === 'close') return close();
      if (b.dataset.a === 'kf') { if (b.dataset.k === 'h') fh = b.dataset.v; else fa = b.dataset.v; return list(); }
      if (b.dataset.a === 'get') return confirm(b.dataset.id);
      if (b.dataset.a === 'goods') return confirmGoods(b.dataset.id);
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

  const confirmGoods = (id) => {
    const g = goodsList(st, owns).find((q) => q.id === id);
    if (!g || g.owned) return list();
    el.insertAdjacentHTML('beforeend', `<div class="kk-ov" role="alertdialog" aria-label="交換の確かめ"><canvas class="kk-art" data-goods-art="${g.id}" width="150" height="100" style="max-width:180px" aria-hidden="true"></canvas><p><b>${esc(g.name)}</b><br>武将印 ${g.cost} を使って交換します。<br>使った武将印は戻りません。</p>
      <div class="kk-foot"><button data-a="yes">武将印 ${g.cost} を使って交換する</button><button class="sec" data-a="no">使わずに戻る</button></div></div>`);
    import('./goods_art.js').then((A) => A.fillGoodsArt(el)).catch(() => {});
    el.onclick = (e) => {
      const b = e.target.closest('[data-a]'); if (!b) return;
      if (b.dataset.a !== 'yes') return list();
      const res = exchangeGoods(st, id, owns);
      if (!res.ok) return list();
      try { C?.giftLook?.(res.look); } catch (err) { /* 着られなくても交換は残る（次に開いた時に帳から） */ }
      try { o.onSave && o.onSave(st); } catch (err) { /* 持てなくても画面は進む */ }
      el.querySelector('.kk-ov')?.remove();
      el.insertAdjacentHTML('beforeend', `<div class="kk-ov"><p>交換した</p><canvas class="kk-art" data-goods-art="${g.id}" width="150" height="100" style="max-width:220px" aria-hidden="true"></canvas><p><b style="font-size:20px;color:#e8c77a">${esc(g.name)}</b><br>城下の武具屋と戦で着られます</p>
        <div class="kk-foot"><button data-a="back">交換所へ戻る</button></div></div>`);
      import('./goods_art.js').then((A) => A.fillGoodsArt(el)).catch(() => {});
      el.onclick = (e2) => { if (e2.target.closest('[data-a="back"]')) list(); };
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
