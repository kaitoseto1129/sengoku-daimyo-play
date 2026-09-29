// 城下の問屋：褒美の銭で、供（ともの者）・飛び道具（火縄銃・弓）・馬・槍と具足を買う。要らない物は半値で売れる
// screens.js の baseScreen が「問屋」の札で toiyaHtml を出し、toiyaBind で釦をつなぐ
// 買えない物は、なぜ買えないか（銭が足りない・身分が足りない・連れて行ける数）を書く
import { ITEMS, HORSES, RANKS, TOMO, zeni, addKan, newTomo, tomoAlive, tomoCap, ladderStep, scenarioKey } from './state.js';
import { isTouch } from './touch.js';
import { odaToiyaHint } from './oda_town.js';
// 持ち替えの案内（指の端末では右下の丸、キーボードでは数字キー）
const SWAP = (k) => (isTouch ? '戦で右下の持ち替えの丸から' : `戦で数字キー${k}で`);
// 品の説明を、指の端末では丸の言い方にする（「数字キー2で」「左で突き」などを出さない）
export const tnote = (s) => (isTouch ? String(s).replace(/数字キー\d+で持ち替え。/, '右下の持ち替えの丸で持ち替え。').replace('右で構えて狙い', '構えの丸で狙い').replace('構えて左で突き', '構えて突きの丸で突き').replace('左で撃つ', '突きの丸で撃つ').replace('左を押して引き絞り、離して射る', '突きの丸を押して引き絞り、離して射る') : s);

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// 城下での買い物を、日誌の出納のために覚えておく（戦の終わりに main.js が日誌へ写して空にする）
export function spendLog(G, n, kan) { (G.spend = G.spend || []).push({ n, kan: Math.round(kan * 1000) / 1000 }); }

export const TOIYA_ICON = '<svg viewBox="0 0 24 24"><path d="M12 3 V20"/><path d="M5 7 H19"/><path d="M5 7 L2 14 H8 Z"/><path d="M19 7 L16 14 H22 Z"/><path d="M8 20 H16"/></svg>';

const CSS = `<style>
  .toiya .ty-head { display: flex; flex-wrap: wrap; gap: 8px 22px; align-items: baseline; padding: 10px 14px; border: 1px solid var(--line); margin: 0 0 12px; }
  .toiya .ty-head b { font-family: var(--display); font-size: 22px; color: var(--kin); font-weight: 700; font-variant-numeric: tabular-nums; }
  .toiya .ty-head span { font-size: 13px; color: var(--washi-dim); }
  .toiya .ty-sec { display: flex; align-items: baseline; gap: 12px; margin: 16px 0 6px; }
  .toiya .ty-sec h3 { margin: 0; font-size: 15px; letter-spacing: .2em; color: var(--washi); font-weight: 600; }
  .toiya .ty-sec small { font-size: 12.5px; color: var(--washi-dim); }
  .toiya .item .n small.pr { color: var(--kin); }
  .toiya .ty-why { display: block; font-size: 12.5px; color: #e3a08c; text-align: right; line-height: 1.5; }
  .toiya .ty-own { display: block; font-size: 12.5px; color: var(--moegi, #8fb07a); text-align: right; }
  .toiya .ty-can { display: block; margin-top: 4px; font-size: 12.5px; color: var(--kin); }
  .toiya .ty-can::before { content: '買うと　'; color: var(--washi-faint); }
  .toiya .ty-nx { display: block; margin-top: 4px; font-size: 12.5px; color: var(--washi); border-left: 2px solid var(--kin); padding-left: 8px; }
  .toiya .ty-nx b { color: var(--kin); font-weight: 500; margin-right: 6px; }
  .toiya .ty-wage { display: block; margin-top: 6px; font-size: 14px; color: var(--washi); text-align: right; font-variant-numeric: tabular-nums; }
  .toiya .ty-wage b { color: #e3a08c; font-weight: 600; }
  .toiya .ty-tomo { display: flex; flex-wrap: wrap; gap: 8px; margin: 4px 0 8px; }
  .toiya .ty-tomo .tt { display: flex; gap: 10px; align-items: center; border: 1px solid var(--line); padding: 4px 4px 4px 12px; font-size: 13.5px; min-height: 44px; box-sizing: border-box; }
  .toiya .ty-tomo .tt small { color: var(--washi-dim); font-size: 12px; }
  .toiya .hb { display: inline-block; width: 70px; height: 6px; background: var(--sumi-3); position: relative; vertical-align: middle; margin: 0 10px 0 4px; box-shadow: 0 0 0 1px rgba(236,228,210,.35); }
  .toiya .hb b { position: absolute; inset: 0; right: auto; background: var(--kin); }
  .toiya .hst { display: block; margin-top: 4px; font-size: 12px; color: var(--washi-dim); }
  .toiya .btn.small { min-height: 44px; min-width: 44px; }
  .toiya .ty-acts { display: flex; flex-direction: column; gap: 6px; align-items: flex-end; }
  .toiya #ty-cf:empty { display: none; }
  /* 店先の暖簾（問屋の看板） */
  .toiya .ty-noren { display: flex; gap: 3px; height: 38px; margin: 0 0 10px; }
  .toiya .ty-noren i { flex: 1; display: grid; place-items: center; font-style: normal; font-family: var(--display); font-weight: 800; font-size: 18px; color: #ece4d2; background: linear-gradient(180deg, #34496a, #24354f 70%, #1d2b40); border-bottom: 2px solid #15202f; }
  .toiya .ty-noren i:nth-child(2) { flex: 0 0 38px; font-size: 0; }
  .toiya .ty-noren i:nth-child(2)::before { content: ''; width: 18px; height: 18px; border-radius: 50%; border: 2px solid #ece4d2; }
  /* 所持金（穴あき銭）と、いま出入りした銭 */
  .toiya .ty-head .ty-coin { width: 22px; height: 22px; align-self: center; color: var(--kin); }
  .toiya .ty-head .ty-money { display: inline-flex; gap: 8px; align-items: center; }
  .toiya .ty-delta { font-style: normal; font-size: 15px; font-weight: 600; font-variant-numeric: tabular-nums; animation: tyUp 1.8s ease-out forwards; }
  .toiya .ty-delta.dn { color: #e3a08c; } .toiya .ty-delta.up { color: var(--moegi, #8fb07a); }
  /* 品は棚に並べる：左に品の絵、下に棚板、値は木の値札 */
  .toiya .items .item { grid-template-columns: 48px 1fr auto; position: relative; background: linear-gradient(180deg, rgba(150,110,60,.08), rgba(0,0,0,0) 65%); border-bottom: 3px solid rgba(110,80,44,.7); }
  .toiya .items .item.eq { border-color: var(--kin); }
  .toiya .items .item .n, .toiya .items .item .x { grid-column: 2; }
  .toiya .items .item .a { grid-column: 3; }
  .toiya .ty-ic { grid-row: 1 / span 2; grid-column: 1; position: relative; width: 44px; height: 44px; display: grid; place-items: center; align-self: start; background: radial-gradient(circle at 50% 35%, rgba(194,162,90,.16), rgba(0,0,0,.25)); border: 1px solid rgba(194,162,90,.35); color: var(--kin); }
  .toiya .ty-ic svg { width: 28px; height: 28px; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }
  .toiya .item .n small.pr { display: inline-block; color: #1b140c; background: #b39468; padding: 0 7px; margin-left: 10px; font-size: 12.5px; font-weight: 600; clip-path: polygon(6px 0, 100% 0, 100% 100%, 6px 100%, 0 50%); padding-left: 10px; }
  /* 買った・雇った・売ったの朱印と、棚の光 */
  .toiya .item.ty-got { animation: tyGlow 1.4s ease-out; }
  .toiya .ty-stamp { position: absolute; inset: auto -14px -10px auto; font-size: 12px; font-weight: 700; color: #f07a60; border: 2px solid #d9573e; background: rgba(20,14,10,.85); padding: 1px 3px; transform: rotate(-10deg); white-space: nowrap; animation: tyStamp .35s cubic-bezier(.3,1.6,.5,1); pointer-events: none; }
  @keyframes tyStamp { from { transform: scale(2) rotate(-18deg); opacity: 0; } to { transform: scale(1) rotate(-10deg); opacity: 1; } }
  @keyframes tyGlow { from { box-shadow: 0 0 0 2px var(--kin), 0 0 22px rgba(194,162,90,.55); } to { box-shadow: 0 0 0 0 rgba(194,162,90,0); } }
  @keyframes tyUp { 0% { opacity: 0; transform: translateY(6px); } 15% { opacity: 1; transform: none; } 70% { opacity: 1; } 100% { opacity: .75; } }
  body.rm .toiya *, body.rm .toiya { animation: none !important; }
  @media (prefers-reduced-motion: reduce) { .toiya *, .toiya { animation: none !important; } }
  /* iPhone 横：字を減らす（言い添えは隠し、説明は二行まで） */
  @media (max-height: 500px) {
    .toiya .ty-noren { height: 28px; margin-bottom: 8px; } .toiya .ty-noren i { font-size: 15px; }
    .toiya .ty-head { padding: 6px 12px; margin-bottom: 8px; } .toiya .ty-head .ty-more, .toiya .ty-sec small.more, .toiya .ty-can { display: none; }
    .toiya .ty-sec { margin: 12px 0 4px; }
    .toiya .ty-note { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .toiya .items .item { padding: 8px 10px; gap: 2px 12px; }
  }
</style>`;
// 品の絵（線で描く。字の代わりではなく、棚に並んだ物の目印）
const IC = {
  gun: '<path d="M2 12 H20 M20 10.5 V13.5 M6 12 L4 17.5 H7.5 L9 13"/><path d="M12 12 C12 15, 14.5 15, 14 18"/>',
  bow: '<path d="M8 2 C18 6, 18 18, 8 22"/><path d="M8 2 V22"/><path d="M4 12 H20 M18 10 L20 12 L18 14"/>',
  horse: '<path d="M4 20 V13 C4 10, 7 9, 10 9 H15 L17.5 4.5 L21 7 L19 10.5 V20 M15 9 V20 M4 13 L2.5 16.5"/>',
  man: '<circle cx="12" cy="5" r="2.4"/><path d="M8 21 L9 11 H15 L16 21 M9 11 L6 16 M15 11 L18 16"/>',
  spear: '<path d="M4 20 L18 6"/><path d="M18 6 L21.5 2.5 L20.5 7.5 Z"/><path d="M14.5 7.5 L16.5 9.5"/>',
  katana: '<path d="M4 20 C10 14, 15 9, 21 3"/><path d="M5.5 15.5 L8.5 18.5"/>',
  hat: '<path d="M4 15 C4 8, 20 8, 20 15 Z"/><path d="M2 15 H22 M12 8.6 V5.5 M9 5.5 L12 3 L15 5.5"/>',
  kasa: '<path d="M2 15 L12 7 L22 15 Z"/><path d="M9 15 V17 M15 15 V17"/>',
  body: '<path d="M6 4 H18 L19 20 H5 Z"/><path d="M6 9 H18 M5.6 13 H18.4 M5.3 17 H18.7"/>',
  arm: '<path d="M8 3 H14 L16 16 L13 21 H9 L7 16 Z"/><path d="M8 8 H15 M7.5 12 H15.5"/>',
  leg: '<path d="M7 4 H17 L16 20 H8 Z"/><path d="M8 9 H16 M8 14 H16"/>',
  coat: '<path d="M4 6 L9 3 H15 L20 6 L19 21 H5 Z"/><path d="M12 3 V21"/>',
};
const icon = (k, stamp) => `<span class="ty-ic" aria-hidden="true"><svg viewBox="0 0 24 24">${IC[k] || IC.man}</svg>${stamp || ''}</span>`;
const SLOT_IC = { weapon: 'spear', side: 'katana', hat: 'hat', body: 'body', arm: 'arm', thigh: 'leg', shin: 'leg', coat: 'coat' };
const COIN = '<svg class="ty-coin" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="9" y="9" width="6" height="6" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>';
// いま買った・雇った・売った品（描き直した時に一度だけ朱印を押し、銭の出入りを見せる）
let got = null;
const gotOf = (g, k) => (g && g.k === k ? { cls: ' ty-got', stamp: `<b class="ty-stamp">${g.s}</b>` } : { cls: '', stamp: '' });

// 買えない理由（無ければ ''）
function why(G, cost, minRank) {
  if (minRank && G.rank < minRank) return `身分が足りない（${RANKS[minRank].name}から）`;
  if (cost > (G.kan || 0)) return `銭が足りない（あと${zeni(cost - (G.kan || 0))}）`;
  return '';
}
// 読み上げの名は、見える字で始めて品の名を足す（「3貫で買う：火縄銃」）
const buyBtn = (attr, id, cost, name, label = '買う') => `<button class="btn small" ${attr}="${id}" aria-label="${zeni(cost)}で${esc(label)}：${esc(name)}">${zeni(cost)}で${esc(label)}</button>`;
// 売る値（買った値の半分。賜り物・はじめから持つ物は売れない）
const sellPrice = (cost) => Math.round((cost || 0) * 500) / 1000;
const sellBtn = (attr, id, cost, name) => `<button class="btn small" ${attr}="${id}" aria-label="${zeni(sellPrice(cost))}で売る：${esc(name)}">${zeni(sellPrice(cost))}で売る</button>`;
// 次の戦ではどう効くか（織田家編の城下だけ）
function hint(G, k) {
  if (scenarioKey() !== 'oda') return '';
  const h = odaToiyaHint(G, k);
  return h ? `<span class="ty-nx"><b>次の戦（${esc(h.name)}）では</b>${esc(h.text)}</span>` : '';
}

// いまの銭で買える物が一つも無い時は、一番安い物とあと何貫かを先に言う（「何も買えない」で終わらせない）
function cheapest(G) {
  const kan = G.kan || 0, full = tomoAlive(G).length >= tomoCap(G);
  const list = [
    ...Object.values(TOMO).filter((d) => !full && !(d.minRank && G.rank < d.minRank)).map((d) => ({ n: d.name, c: d.hire })),
    ...Object.entries(ITEMS).filter(([id, it]) => it.cost && !G.owned.includes(id) && !(it.minRank && G.rank < it.minRank)).map(([, it]) => ({ n: it.name, c: it.cost })),
  ];
  if (!list.length || list.some((x) => x.c <= kan)) return '';
  const m = list.reduce((a, x) => (x.c < a.c ? x : a));
  return `<span style="flex-basis:100%;color:var(--washi)">いまの銭で買える物はまだ無い。一番安いのは${esc(m.n)}（あと${zeni(m.c - kan)}）。次の戦の褒美で買える</span>`;
}

export function toiyaHtml(G) {
  const g = got; got = null;
  const T = tomoAlive(G), cap = tomoCap(G);
  const wage = T.reduce((a, t) => a + ((TOMO[t.kind] || {}).wage || 0), 0);
  const roku = (RANKS[G.rank] || RANKS[0]).roku || 1;
  const ride = ladderStep(G) >= 2;
  const horses = G.horses || [];
  const cur = (G.horse || {}).id || 'tsukikage';
  const delta = g && g.d ? `<em class="ty-delta ${g.d < 0 ? 'dn' : 'up'}">${g.d < 0 ? '−' : '＋'}${zeni(Math.abs(g.d))}</em>` : '';
  const head = `<div class="ty-head" role="status"><span class="ty-money">${COIN}<span>所持金</span><b>${zeni(G.kan)}</b>${delta}</span>
    <span>禄 ${zeni(roku)}／戦${wage ? `　・　供の給金 −${zeni(wage)}／戦` : ''}</span>
    <span class="ty-more">戦を終えると、戦功・任務・討ち取り・分捕りに応じて褒美が出る</span>${cheapest(G)}</div>`;
  // 供
  const tomoNow = T.length ? `<div class="ty-tomo" aria-label="いまの供">${T.map((t) => `<div class="tt"><span>${esc(t.name)}<small>　${esc(TOMO[t.kind].name)}・${t.battles || 0}戦・給金 ${zeni(TOMO[t.kind].wage)}／戦</small></span><button class="btn small" data-ty-fire="${t.id}" aria-label="${esc(t.name)}に暇を出す">暇を出す</button></div>`).join('')}</div>` : '<p class="note" style="margin:2px 0 8px">まだ供はいない。雇えば戦で自分のすぐ後ろについて戦う。</p>';
  const tomoCards = Object.entries(TOMO).map(([k, d]) => {
    const full = T.length >= cap;
    const w = (d.minRank && G.rank < d.minRank) ? why(G, d.hire, d.minRank) : full ? `連れて行けるのは${cap}人まで（身分が上がると増える）` : why(G, d.hire);
    const o = gotOf(g, 'tomo:' + k);
    return `<div class="item${o.cls}">${icon(k === 'teppo' ? 'gun' : k === 'yarimochi' ? 'spear' : 'man', o.stamp)}<div class="n">${esc(d.name)}<small class="pr">雇い賃 ${zeni(d.hire)}</small></div>
      <div class="x"><span class="ty-note">${esc(d.note)}</span><span class="ty-can">戦でついて来る供が一人増える</span></div>
      <div class="a">${w ? `<span class="ty-why">${esc(w)}</span>` : buyBtn('data-ty-hire', k, d.hire, d.name, '雇う')}<span class="ty-wage">毎戦 <b>${zeni(d.wage)}</b> の給金</span></div></div>`;
  }).join('');
  // 飛び道具
  const ranged = ['teppo', 'yumi'].map((id) => {
    const it = ITEMS[id];
    const own = G.owned.includes(id);
    const w = own ? '' : why(G, it.cost, it.minRank);
    const o = gotOf(g, 'it:' + id);
    return `<div class="item ${own ? 'eq' : ''}${o.cls}">${icon(id === 'teppo' ? 'gun' : 'bow', o.stamp)}<div class="n">${esc(it.name)}<small class="pr">${zeni(it.cost)}</small></div>
      <div class="x"><span class="ty-note">${esc(tnote(it.note))}</span><span class="ty-can">${id === 'teppo' ? '戦の中で持ち替えて、遠くの敵を撃てる' : '戦の中で持ち替えて、矢を射かけられる'}</span>${hint(G, 'gun')}</div>
      <div class="a">${own ? `<div class="ty-acts"><span class="ty-own">所持（${SWAP(id === 'teppo' ? 3 : 4)}持ち替え）</span>${sellBtn('data-ty-sell', id, it.cost, it.name)}</div>` : w ? `<span class="ty-why">${esc(w)}</span>` : buyBtn('data-ty-buy', id, it.cost, it.name)}</div></div>`;
  }).join('');
  // 馬（分捕り馬は買えないので並べない）。買っても乗る馬は替えない（乗り換えは馬屋で）
  const bar = (v) => `<i class="hb"><b style="width:${Math.round(Math.min(1, v / 1.4) * 100)}%"></b></i>`;
  const horseCards = Object.entries(HORSES).filter(([, h]) => !h.spoil).map(([id, h]) => {
    const own = horses.includes(id) && (id !== 'tsukikage' || ride);
    const nm = h.grade && h.grade !== h.name ? `${h.grade}「${h.name}」` : h.name;
    let act;
    if (id === 'tsukikage' && !ride) act = '<span class="ty-own">足軽大将になると賜る</span>';
    else if (own) act = `<div class="ty-acts"><span class="ty-own">${cur === id ? '乗っている' : '所持（馬屋で乗り換え）'}</span>${cur !== id && h.cost ? sellBtn('data-ty-hsell', id, h.cost, nm) : ''}</div>`;
    else { const w = why(G, h.cost); act = w ? `<span class="ty-why">${esc(w)}</span>` : buyBtn('data-ty-horse', id, h.cost, nm); }
    const o = gotOf(g, 'h:' + id);
    return `<div class="item ${own ? 'eq' : ''}${o.cls}">${icon('horse', o.stamp)}<div class="n">${esc(nm)}<small class="pr">${id === 'tsukikage' ? '賜り物' : zeni(h.cost)}</small></div>
      <div class="x"><span class="ty-note">${esc(h.kind)}。${esc(h.note)}</span><span class="hst">速さ${bar(h.speed)}体力${bar(h.hp)}息${bar(h.breath)}</span><span class="ty-can">${ride ? '馬屋で乗り換えて、馬上で戦える' : '足軽大将になった時、この馬に乗って出陣できる'}</span>${hint(G, 'horse')}</div>
      <div class="a">${act}</div></div>`;
  }).join('');
  // 槍・刀・具足（着けていない買った物は売れる）
  const SLOT = { weapon: '槍', side: '刀', hat: '兜・笠', body: '胴', arm: '籠手', thigh: '佩楯', shin: '脛当', coat: '陣羽織' };
  const gear = Object.entries(ITEMS).filter(([, it]) => it.cost && SLOT[it.slot]).map(([id, it]) => {
    const own = G.owned.includes(id);
    const worn = G.equip && G.equip[it.slot] === id;
    const w = own ? '' : why(G, it.cost, it.minRank);
    const o = gotOf(g, 'it:' + id);
    return `<div class="item ${own ? 'eq' : ''}${o.cls}">${icon(it.look === 'jingasa' || /笠/.test(it.name) ? 'kasa' : SLOT_IC[it.slot], o.stamp)}<div class="n">${esc(it.name)}<small>${SLOT[it.slot]}</small><small class="pr">${zeni(it.cost)}</small></div>
      <div class="x"><span class="ty-note">${esc(tnote(it.note))}</span></div>
      <div class="a">${own ? `<div class="ty-acts"><span class="ty-own">${worn ? '身につけている' : '所持（武具屋で着ける）'}</span>${worn || it.slot === 'side' ? '' : sellBtn('data-ty-sell', id, it.cost, it.name)}</div>` : w ? `<span class="ty-why">${esc(w)}</span>` : buyBtn('data-ty-buy', id, it.cost, it.name)}</div></div>`;
  }).join('');
  return `${CSS}<div class="toiya"><div class="ty-noren" aria-hidden="true"><i>問</i><i></i><i>屋</i></div>${head}<div id="ty-cf"></div>
    <div class="ty-sec"><h3>供（ともの者）</h3><small>連れて行ける数 ${T.length}／${cap}人</small><small class="more">${esc(RANKS[G.rank].name)}・足軽は中間だけ、槍持ちは組頭候補、若党と鉄砲足軽は組頭から・討たれた供は戻らない</small></div>${tomoNow}${hint(G, 'tomo') ? `<p class="note">${hint(G, 'tomo')}</p>` : ''}<div class="items">${tomoCards}</div>
    <div class="ty-sec"><h3>飛び道具</h3><small class="more">槍・刀と持ち替えて使う</small></div><div class="items">${ranged}</div>
    <div class="ty-sec"><h3>馬</h3><small class="more">乗れるのは足軽大将から。先に買っておける（乗り換えは馬屋で）</small></div><div class="items">${horseCards}</div>
    <div class="ty-sec"><h3>槍・刀・具足</h3><small class="more">買った物は武具屋で着け替える。着けていない物は半値で売れる</small></div><div class="items">${gear}</div>
  </div>`;
}

// いまの銭で買える物・雇える供があるか（札の印に使う）
export function toiyaCheap(G) {
  if (tomoAlive(G).length < tomoCap(G) && Object.values(TOMO).some((d) => d.hire <= (G.kan || 0) && !(d.minRank && G.rank < d.minRank))) return true;
  return ['teppo', 'yumi'].some((id) => !G.owned.includes(id) && ITEMS[id].cost <= (G.kan || 0));
}

// 所持金の半分を超える買い物は、確かめの札を挟む（991）
function sure(G, cost, name, confirm, go) {
  const box = document.getElementById('ty-cf');
  if (!confirm || !box || cost <= (G.kan || 0) / 2) { go(); return; }
  confirm(box, `${name}を${zeni(cost)}で買います`, '買う', go, { sub: `所持金の半分を超える買い物です（買うと残り ${zeni((G.kan || 0) - cost)}）。` });
  box.scrollIntoView?.({ block: 'nearest' });
}
// 釦をつなぐ。done(知らせ, 音, 焦点を戻す釦の選び方) で保存して描き直す
// confirm(箱, 文, 決める字, 決めた時) は取り消せない操作の確かめ（screens.js の confirmBox）
export function toiyaBind(G, done, confirm) {
  document.querySelectorAll('[data-ty-hire]').forEach((b) => b.onclick = () => {
    const d = TOMO[b.dataset.tyHire];
    if (!d || (G.kan || 0) < d.hire || tomoAlive(G).length >= tomoCap(G) || (d.minRank && G.rank < d.minRank)) return;
    addKan(G, -d.hire);
    spendLog(G, `${d.name}の雇い賃`, d.hire);
    G.tomo = G.tomo || [];
    const t = newTomo(G, b.dataset.tyHire);
    G.tomo.push(t);
    got = { k: 'tomo:' + b.dataset.tyHire, s: '雇った', d: -d.hire };
    done(`${d.name}の${t.name}を雇った（給金 ${zeni(d.wage)}／戦）`, 'merit', `[data-ty-fire="${t.id}"]`);
  });
  document.querySelectorAll('[data-ty-buy]').forEach((b) => b.onclick = () => {
    const id = b.dataset.tyBuy, it = ITEMS[id];
    if (!it || G.owned.includes(id) || (G.kan || 0) < it.cost || (it.minRank && G.rank < it.minRank)) return;
    sure(G, it.cost, it.name, confirm, () => {
    addKan(G, -it.cost);
    spendLog(G, it.name, it.cost);
    G.owned.push(id);
    // 着ける物は、買ったらすぐ着ける（武具屋と同じ）
    if (G.equip && it.slot in G.equip && it.slot !== 'side') G.equip[it.slot] = id;
    got = { k: 'it:' + id, s: '買った', d: -it.cost };
    done(`${it.name}を買った`, 'merit', `[data-ty-sell="${id}"]`);
    });
  });
  document.querySelectorAll('[data-ty-horse]').forEach((b) => b.onclick = () => {
    const id = b.dataset.tyHorse, h = HORSES[id];
    if (!h || h.spoil || (G.kan || 0) < h.cost) return;
    sure(G, h.cost, h.name, confirm, () => {
    addKan(G, -h.cost);
    spendLog(G, h.name, h.cost);
    // 買っても乗る馬は替えない（乗り換えは馬屋で。いまの馬の絆と名はそのまま）
    G.horses = [...(G.horses || ['tsukikage']), id];
    G.horseBonds = { ...(G.horseBonds || {}), [id]: (G.horseBonds || {})[id] || { id, bond: 0 } };
    got = { k: 'h:' + id, s: '買った', d: -h.cost };
    done(`${h.grade}「${h.name}」を買った${ladderStep(G) >= 2 ? '（馬屋で乗り換えられる）' : '（足軽大将になれば乗れる）'}`, 'neigh', `[data-ty-hsell="${id}"]`);
    });
  });
  // 売る：半値。着けている物・乗っている馬は売れない（釦を出さない）
  document.querySelectorAll('[data-ty-sell]').forEach((b) => b.onclick = () => {
    const id = b.dataset.tySell, it = ITEMS[id];
    if (!it || !G.owned.includes(id) || (G.equip && G.equip[it.slot] === id)) return;
    addKan(G, sellPrice(it.cost));
    spendLog(G, `${it.name}を売る`, -sellPrice(it.cost));
    G.owned = G.owned.filter((x) => x !== id);
    got = { k: 'it:' + id, s: '売った', d: sellPrice(it.cost) };
    done(`${it.name}を${zeni(sellPrice(it.cost))}で売った`, 'ui');
  });
  document.querySelectorAll('[data-ty-hsell]').forEach((b) => b.onclick = () => {
    const id = b.dataset.tyHsell, h = HORSES[id];
    if (!h || !(G.horses || []).includes(id) || ((G.horse || {}).id || 'tsukikage') === id) return;
    addKan(G, sellPrice(h.cost));
    spendLog(G, `${h.name}を売る`, -sellPrice(h.cost));
    G.horses = G.horses.filter((x) => x !== id);
    if (G.horseBonds) delete G.horseBonds[id];
    got = { k: 'h:' + id, s: '売った', d: sellPrice(h.cost) };
    done(`${h.name}を${zeni(sellPrice(h.cost))}で売った`, 'neigh');
  });
  document.querySelectorAll('[data-ty-fire]').forEach((b) => b.onclick = () => {
    const t = (G.tomo || []).find((x) => x.id === b.dataset.tyFire);
    if (!t) return;
    const go = () => { G.tomo = G.tomo.filter((x) => x !== t); done(`${t.name}に暇を出した`, 'ui'); };
    // 取り消せないので、確かめの札で聞く
    const box = document.getElementById('ty-cf');
    if (confirm && box) confirm(box, `${t.name}（${TOMO[t.kind].name}）に暇を出しますか`, '暇を出す', go, { sub: '暇を出した供は戻りません。雇い直すには、また雇い賃がかかります。' });
    else go();
  });
}
