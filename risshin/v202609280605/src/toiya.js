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
</style>`;

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
  const T = tomoAlive(G), cap = tomoCap(G);
  const wage = T.reduce((a, t) => a + ((TOMO[t.kind] || {}).wage || 0), 0);
  const roku = (RANKS[G.rank] || RANKS[0]).roku || 1;
  const ride = ladderStep(G) >= 2;
  const horses = G.horses || [];
  const cur = (G.horse || {}).id || 'tsukikage';
  const head = `<div class="ty-head" role="status"><span>所持金</span><b>${zeni(G.kan)}</b>
    <span>禄 ${zeni(roku)}／戦${wage ? `　・　供の給金 −${zeni(wage)}／戦` : ''}</span>
    <span>戦を終えると、戦功・任務・討ち取り・分捕りに応じて褒美が出る</span>${cheapest(G)}</div>`;
  // 供
  const tomoNow = T.length ? `<div class="ty-tomo" aria-label="いまの供">${T.map((t) => `<div class="tt"><span>${esc(t.name)}<small>　${esc(TOMO[t.kind].name)}・${t.battles || 0}戦・給金 ${zeni(TOMO[t.kind].wage)}／戦</small></span><button class="btn small" data-ty-fire="${t.id}" aria-label="${esc(t.name)}に暇を出す">暇を出す</button></div>`).join('')}</div>` : '<p class="note" style="margin:2px 0 8px">まだ供はいない。雇えば戦で自分のすぐ後ろについて戦う。</p>';
  const tomoCards = Object.entries(TOMO).map(([k, d]) => {
    const full = T.length >= cap;
    const w = (d.minRank && G.rank < d.minRank) ? why(G, d.hire, d.minRank) : full ? `連れて行けるのは${cap}人まで（身分が上がると増える）` : why(G, d.hire);
    return `<div class="item"><div class="n">${esc(d.name)}<small class="pr">雇い賃 ${zeni(d.hire)}</small></div>
      <div class="x">${esc(d.note)}<span class="ty-can">戦でついて来る供が一人増える</span></div>
      <div class="a">${w ? `<span class="ty-why">${esc(w)}</span>` : buyBtn('data-ty-hire', k, d.hire, d.name, '雇う')}<span class="ty-wage">毎戦 <b>${zeni(d.wage)}</b> の給金</span></div></div>`;
  }).join('');
  // 飛び道具
  const ranged = ['teppo', 'yumi'].map((id) => {
    const it = ITEMS[id];
    const own = G.owned.includes(id);
    const w = own ? '' : why(G, it.cost, it.minRank);
    return `<div class="item ${own ? 'eq' : ''}"><div class="n">${esc(it.name)}<small class="pr">${zeni(it.cost)}</small></div>
      <div class="x">${esc(tnote(it.note))}<span class="ty-can">${id === 'teppo' ? '戦の中で持ち替えて、遠くの敵を撃てる' : '戦の中で持ち替えて、矢を射かけられる'}</span>${hint(G, 'gun')}</div>
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
    return `<div class="item ${own ? 'eq' : ''}"><div class="n">${esc(nm)}<small class="pr">${id === 'tsukikage' ? '賜り物' : zeni(h.cost)}</small></div>
      <div class="x">${esc(h.kind)}。${esc(h.note)}<span class="hst">速さ${bar(h.speed)}体力${bar(h.hp)}息${bar(h.breath)}</span><span class="ty-can">${ride ? '馬屋で乗り換えて、馬上で戦える' : '足軽大将になった時、この馬に乗って出陣できる'}</span>${hint(G, 'horse')}</div>
      <div class="a">${act}</div></div>`;
  }).join('');
  // 槍・刀・具足（着けていない買った物は売れる）
  const SLOT = { weapon: '槍', side: '刀', hat: '兜・笠', body: '胴', arm: '籠手', thigh: '佩楯', shin: '脛当', coat: '陣羽織' };
  const gear = Object.entries(ITEMS).filter(([, it]) => it.cost && SLOT[it.slot]).map(([id, it]) => {
    const own = G.owned.includes(id);
    const worn = G.equip && G.equip[it.slot] === id;
    const w = own ? '' : why(G, it.cost, it.minRank);
    return `<div class="item ${own ? 'eq' : ''}"><div class="n">${esc(it.name)}<small>${SLOT[it.slot]}</small><small class="pr">${zeni(it.cost)}</small></div>
      <div class="x">${esc(tnote(it.note))}</div>
      <div class="a">${own ? `<div class="ty-acts"><span class="ty-own">${worn ? '身につけている' : '所持（武具屋で着ける）'}</span>${worn || it.slot === 'side' ? '' : sellBtn('data-ty-sell', id, it.cost, it.name)}</div>` : w ? `<span class="ty-why">${esc(w)}</span>` : buyBtn('data-ty-buy', id, it.cost, it.name)}</div></div>`;
  }).join('');
  return `${CSS}<div class="toiya">${head}<div id="ty-cf"></div>
    <div class="ty-sec"><h3>供（ともの者）</h3><small>連れて行ける数 ${T.length}／${cap}人（${esc(RANKS[G.rank].name)}）・足軽は中間だけ、槍持ちは組頭候補、若党と鉄砲足軽は組頭から・討たれた供は戻らない</small></div>${tomoNow}${hint(G, 'tomo') ? `<p class="note">${hint(G, 'tomo')}</p>` : ''}<div class="items">${tomoCards}</div>
    <div class="ty-sec"><h3>飛び道具</h3><small>槍・刀と持ち替えて使う</small></div><div class="items">${ranged}</div>
    <div class="ty-sec"><h3>馬</h3><small>乗れるのは足軽大将から。先に買っておける（乗り換えは馬屋で）</small></div><div class="items">${horseCards}</div>
    <div class="ty-sec"><h3>槍・刀・具足</h3><small>買った物は武具屋で着け替える。着けていない物は半値で売れる</small></div><div class="items">${gear}</div>
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
    done(`${it.name}を${zeni(sellPrice(it.cost))}で売った`, 'ui');
  });
  document.querySelectorAll('[data-ty-hsell]').forEach((b) => b.onclick = () => {
    const id = b.dataset.tyHsell, h = HORSES[id];
    if (!h || !(G.horses || []).includes(id) || ((G.horse || {}).id || 'tsukikage') === id) return;
    addKan(G, sellPrice(h.cost));
    spendLog(G, `${h.name}を売る`, -sellPrice(h.cost));
    G.horses = G.horses.filter((x) => x !== id);
    if (G.horseBonds) delete G.horseBonds[id];
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
