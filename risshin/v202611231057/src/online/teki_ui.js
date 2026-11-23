// K611 ①③（11/21 kaito・iMac k598-home）：諸大名と戦うの 家臣団の札（①）と［敵を決める］（③）。
//   ① 家を選んだ時、その家の家臣団（十人ほど）を札で見せる：顔・名・兵種・レア。
//   ③［敵を決める］：全部の家を横に並べ、家を選ぶとその家の武将が並ぶ。どの家の武将でも敵に入れられる（十人まで・K638）。『全家』で家をまたいで格の順に並ぶ（オールスター）。
//      一隊の兵力（1000〜10000）と兵種（そのまま・鉄砲・騎馬・槍・弓）も自由に（例：オールスターの鉄砲 1万 × 6 対 自軍）。
//      遊びの場なので褒美は無い（match_link の練習と同じ＝段位も動かない）。
//   使い方（taisen_ui.js が呼ぶ）：
//     retainerCards(names, { face })                       … 札の帯（DOM）
//     openTeki(body, { top, houses, maps, face, onGo(cfg), onBack })  … cfg＝{ foe:[名], foeNominal, foeHeishu|null, map }
import { BUSHOU_ONLINE } from './bushou_online.js';
import { isEn, tr, addEn } from '../i18n.js';
import { troopsOf } from './unit_type.js';

const RC = { SS: '#f1c75b', S: '#e0703a', A: '#5fb26a', R: '#5b8fd6', N: '#9a9a9a' };
const FAV_HS = { kiba: '騎馬', teppo: '鉄砲', yari: '槍', yumi: '弓', std: '槍', shubi: '槍' };
const HS_EN = { 騎馬: 'Cavalry', 鉄砲: 'Gunners', 槍: 'Spear', 弓: 'Bow' };
const HS_MARK = { 騎馬: '騎', 鉄砲: '鉄', 槍: '槍', 弓: '弓' };
// K638 続き（kaito 11/22「敵を決めるに色々な上限がある。6人しか選べない等でボロボロ」）：敵もこちらの出陣枠と同じ十人まで
export const FOE_MAX = 16;   // K642 ③：出陣枠と同じ十六
export const NOMINALS = [1000, 2000, 3000, 5000, 10000];
const HEISHU = [null, '鉄砲', '騎馬', '槍', '弓'];

const CSS = `
.tk-cards{flex:none;display:flex;gap:6px;overflow-x:auto;overflow-y:hidden;padding:2px 0 4px;scrollbar-width:thin;min-height:98px}
.tk-c{flex:none;box-sizing:border-box;width:76px;display:flex;flex-direction:column;align-items:center;gap:2px;padding:5px 3px 4px;border:1px solid var(--rc,#666);border-radius:6px;background:rgba(20,15,10,.75);color:#f1e7d0;font:inherit;font-size:12px;line-height:1.2;text-align:center}
.tk-c .f{position:relative;flex:none;width:46px;height:46px;border-radius:50%;overflow:hidden;display:flex;align-items:center;justify-content:center;background:#2a2218;border:2px solid var(--rc,#666)}
.tk-c .f img{width:100%;height:100%;object-fit:cover}
.tk-c b{font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:70px}
.tk-c span{display:flex;gap:4px;align-items:center;font-size:12px;opacity:.9}
.tk-c i{font-style:normal;padding:0 4px;border-radius:3px;border:1px solid var(--rc,#666);color:var(--rc,#ccc);font-size:11px;line-height:15px}
button.tk-c{cursor:pointer;min-height:44px}
button.tk-c[aria-pressed=true]{background:rgba(110,40,24,.85);border-color:#ffd88a}
.tk-wrap{flex:1;display:flex;flex-direction:column;gap:6px;min-height:0;overflow-y:auto;padding-bottom:8px}
.tk-houses{display:flex;gap:6px;overflow-x:auto;flex:none;padding-bottom:2px}
.tk-houses button{flex:none}
.tk-lab{font-size:13px;color:#ffd88a;flex:none}
.tk-row{display:flex;gap:6px;flex-wrap:wrap;align-items:center;flex:none}
.tk-sum{font-size:14px;color:#f1e7d0;flex:none}
.tk-sum b{color:#ffd88a}
`;
const css = () => { if (!document.getElementById('tk-css')) { const st = document.createElement('style'); st.id = 'tk-css'; st.textContent = CSS; document.head.appendChild(st); } };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const rowOf = (n) => BUSHOU_ONLINE.find((b) => b.name === n);
const hsOf = (n) => FAV_HS[rowOf(n)?.fav] || '槍';

function card(n, o = {}) {
  const en = isEn(), b = rowOf(n), rk = b?.rank || 'N', hs = o.heishu || hsOf(n);
  const el = document.createElement(o.button ? 'button' : 'div');
  if (o.button) el.type = 'button';
  el.className = 'tk-c'; el.style.setProperty('--rc', RC[rk] || RC.N);
  el.setAttribute('aria-label', `${en ? tr(n) : n}・${en ? HS_EN[hs] : hs}・${rk}`);
  el.innerHTML = `<div class="f"></div><b>${esc(en ? tr(n) : n)}</b><span>${esc(en ? HS_EN[hs] : HS_MARK[hs] || hs)}<i>${rk}</i></span>`;
  if (o.face) try { o.face(el.querySelector('.f'), n); } catch (e) { /* 顔が無くても札は出す */ }
  return el;
}

// ① 家臣団の札の帯
export function retainerCards(names, o = {}) {
  css(); en0();
  const box = document.createElement('div'); box.className = 'tk-cards'; box.setAttribute('role', 'list'); box.setAttribute('aria-label', '家臣団');
  for (const n of names || []) { const c = card(n, o); c.setAttribute('role', 'listitem'); box.appendChild(c); }
  return box;
}

// ③［敵を決める］
export function openTeki(body, o = {}) {
  css(); en0();
  const en = isEn(), W = (j, e) => (en ? e : j);
  const st = { house: o.houses?.[0]?.id || 'oda', foe: [], nominal: 1000, heishu: null, map: o.maps?.[0]?.id || 'heigen' };
  const draw = () => {
    body.innerHTML = '';
    body.appendChild(o.top(W('敵を決める', 'Build the enemy'), o.onBack));
    const wrap = document.createElement('div'); wrap.className = 'tk-wrap'; body.appendChild(wrap);
    // 家（横に全部）
    const hs = document.createElement('div'); hs.className = 'tk-houses'; hs.setAttribute('role', 'group'); hs.setAttribute('aria-label', W('家', 'House'));
    for (const h of [{ id: '*', name: '全家（オールスター）', en: 'All houses' }, ...(o.houses || [])]) {
      if (h.id !== '*' && !BUSHOU_ONLINE.some((b) => b.house === h.id)) continue;
      const b = document.createElement('button'); b.type = 'button'; b.className = 'tz-b'; b.dataset.house = h.id; b.textContent = en ? h.en : h.name;
      b.setAttribute('aria-pressed', String(st.house === h.id)); b.onclick = () => { st.house = h.id; draw(); };
      hs.appendChild(b);
    }
    wrap.appendChild(hs);
    // その家の武将（押すと敵に入れる・もう一度で外す）
    const list = document.createElement('div'); list.className = 'tk-cards'; list.setAttribute('role', 'group'); list.setAttribute('aria-label', W('武将', 'Warlords'));
    const RK = ['SS', 'S', 'A', 'R', 'N'];
    for (const b of BUSHOU_ONLINE.filter((x) => st.house === '*' || x.house === st.house).sort((a, c) => RK.indexOf(a.rank) - RK.indexOf(c.rank))) {
      const c = card(b.name, { button: true, face: o.face }); c.dataset.name = b.name;
      c.setAttribute('aria-pressed', String(st.foe.includes(b.name)));
      c.onclick = () => { const i = st.foe.indexOf(b.name); if (i >= 0) st.foe.splice(i, 1); else if (st.foe.length < FOE_MAX) st.foe.push(b.name); else { c.animate?.([{ transform: 'translateX(-3px)' }, { transform: 'translateX(3px)' }, { transform: 'none' }], 250); st.why = W(`敵は ${FOE_MAX} 人まで（こちらの出陣枠と同じ）。入れ替えるには、下の選んだ敵の札を押して外す`, `Up to ${FOE_MAX} enemy generals. Tap a chosen card below to remove it`); draw(); return; } st.why = ''; draw(); };
      list.appendChild(c);
    }
    wrap.appendChild(list);
    // 選んだ敵（押すと外す）
    const lab = document.createElement('div'); lab.className = 'tk-lab'; lab.textContent = W(`敵 ${st.foe.length}/${FOE_MAX}（先頭が総大将・家をまたいで選べる・格も兵種も縛り無し）`, `Enemy ${st.foe.length}/${FOE_MAX} (first is the general; any house, rank or type)`); wrap.appendChild(lab);
    // K638 続き：足せない・戦えない時の理由（その場で）
    const whyT = st.why || (!st.foe.length ? W('敵の武将を一人以上選ぶと戦える（上の札を押す）', 'Pick at least one enemy general to fight') : '');
    if (whyT) { const wy = document.createElement('div'); wy.className = 'tk-lab'; wy.setAttribute('role', 'status'); wy.style.cssText = 'color:#ffb4a4;font-weight:600'; wy.textContent = whyT; wrap.appendChild(wy); }
    const sel = document.createElement('div'); sel.className = 'tk-cards'; sel.dataset.k = 'foe';
    for (const n of st.foe) { const c = card(n, { button: true, face: o.face, heishu: st.heishu }); c.dataset.name = n; c.onclick = () => { st.foe.splice(st.foe.indexOf(n), 1); st.why = ''; draw(); }; sel.appendChild(c); }
    wrap.appendChild(sel);
    // 一隊の兵力・兵種・戦場
    const row = (label, items, cur, set) => {
      const r = document.createElement('div'); r.className = 'tk-row';
      const l = document.createElement('span'); l.className = 'tk-lab'; l.textContent = label; r.appendChild(l);
      for (const [v, t] of items) { const b = document.createElement('button'); b.type = 'button'; b.className = 'tz-b'; b.textContent = t; b.setAttribute('aria-pressed', String(cur === v)); b.onclick = () => { set(v); draw(); }; r.appendChild(b); }
      wrap.appendChild(r);
    };
    row(W('一隊の兵', 'Troops each'), NOMINALS.map((n) => [n, n.toLocaleString()]), st.nominal, (v) => { st.nominal = v; });
    row(W('兵種', 'Type'), HEISHU.map((h) => [h, h ? (en ? HS_EN[h] : h) : W('そのまま', 'As is')]), st.heishu, (v) => { st.heishu = v; });
    row(W('戦場', 'Field'), (o.maps || []).map((m) => [m.id, en ? m.en : m.name]), st.map, (v) => { st.map = v; });
    const mine = Math.max(1, o.mineCount || 4);
    // K638：自軍の兵力は格で率いる兵の和（軍団の画面の総兵力と同じ）。軍団の名が無ければ一人千
    const myT = (o.mineArmy || []).reduce((a, n) => a + troopsOf(BUSHOU_ONLINE.find((b) => b.name === n)), 0) || mine * 1000;
    const sum = document.createElement('div'); sum.className = 'tk-sum';
    sum.innerHTML = W(`敵 <b>${(st.foe.length * st.nominal).toLocaleString()}</b>（${st.foe.length}将）　対　自軍 <b>${myT.toLocaleString()}</b>（${mine}将）　・褒美なし`, `Enemy <b>${(st.foe.length * st.nominal).toLocaleString()}</b> vs yours <b>${myT.toLocaleString()}</b> · No rewards`);
    wrap.appendChild(sum);
    const go = document.createElement('button'); go.type = 'button'; go.className = 'tz-b tz-go'; go.dataset.k = 'tekigo'; go.textContent = W('この敵と戦う', 'Fight this army');
    go.disabled = !st.foe.length; go.style.alignSelf = 'flex-start';
    go.onclick = () => o.onGo?.({ foe: st.foe.slice(), foeNominal: st.nominal, foeHeishu: st.heishu, map: st.map });
    wrap.appendChild(go);
  };
  draw();
}

let enDone = false;
function en0() {
  if (enDone) return; enDone = true;
  addEn([['家臣団', 'Retainers'], ['敵を決める', 'Build the enemy']]);
}
