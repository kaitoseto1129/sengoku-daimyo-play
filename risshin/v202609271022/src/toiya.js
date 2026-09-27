// 城下の問屋：褒美の銭で、供（ともの者）・飛び道具（火縄銃・弓）・馬・槍と具足を買う
// screens.js の baseScreen が「問屋」の札で toiyaHtml を出し、toiyaBind で釦をつなぐ
// 買えない物は、なぜ買えないか（銭が足りない・身分が足りない・連れて行ける数）を書く
import { ITEMS, HORSES, RANKS, TOMO, zeni, addKan, newTomo, tomoAlive, tomoCap, ladderStep } from './state.js';
import { isTouch } from './touch.js';
// 持ち替えの案内（指の端末では右下の丸、キーボードでは数字キー）
const SWAP = (k) => (isTouch ? '戦で右下の持ち替えの丸から' : `戦で数字キー${k}で`);

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export const TOIYA_ICON = '<svg viewBox="0 0 24 24"><path d="M12 3 V20"/><path d="M5 7 H19"/><path d="M5 7 L2 14 H8 Z"/><path d="M19 7 L16 14 H22 Z"/><path d="M8 20 H16"/></svg>';

const CSS = `<style>
  .toiya .ty-head { display: flex; flex-wrap: wrap; gap: 8px 22px; align-items: baseline; padding: 10px 14px; border: 1px solid var(--line); margin: 0 0 12px; }
  .toiya .ty-head b { font-family: var(--display); font-size: 22px; color: var(--kin); font-weight: 700; font-variant-numeric: tabular-nums; }
  .toiya .ty-head span { font-size: 13px; color: var(--washi-dim); }
  .toiya .ty-sec { display: flex; align-items: baseline; gap: 12px; margin: 16px 0 6px; }
  .toiya .ty-sec h4 { margin: 0; font-size: 15px; letter-spacing: .2em; color: var(--washi); font-weight: 600; }
  .toiya .ty-sec small { font-size: 12.5px; color: var(--washi-dim); }
  .toiya .item .n small.pr { color: var(--kin); }
  .toiya .ty-why { display: block; font-size: 12.5px; color: #e3a08c; text-align: right; line-height: 1.5; }
  .toiya .ty-own { display: block; font-size: 12.5px; color: var(--moegi, #8fb07a); text-align: right; }
  .toiya .ty-can { display: block; margin-top: 4px; font-size: 12.5px; color: var(--kin); }
  .toiya .ty-can::before { content: '買うと　'; color: var(--washi-faint); }
  .toiya .ty-tomo { display: flex; flex-wrap: wrap; gap: 8px; margin: 4px 0 8px; }
  .toiya .ty-tomo .tt { display: flex; gap: 10px; align-items: center; border: 1px solid var(--line); padding: 4px 4px 4px 12px; font-size: 13.5px; min-height: 44px; box-sizing: border-box; }
  .toiya .ty-tomo .tt small { color: var(--washi-dim); font-size: 12px; }
  .toiya .hb { display: inline-block; width: 70px; height: 5px; background: var(--sumi-3); position: relative; vertical-align: middle; margin: 0 10px 0 4px; }
  .toiya .hb b { position: absolute; inset: 0; right: auto; background: var(--kin); }
  .toiya .hst { display: block; margin-top: 4px; font-size: 12px; color: var(--washi-dim); }
  .toiya .btn.small { min-height: 44px; min-width: 44px; }
</style>`;

// 買えない理由（無ければ ''）
function why(G, cost, minRank) {
  if (minRank && G.rank < minRank) return `身分が足りない（${RANKS[minRank].name}から）`;
  if (cost > (G.kan || 0)) return `銭が足りない（あと${zeni(cost - (G.kan || 0))}）`;
  return '';
}
const buyBtn = (attr, id, cost, label = '買う') => `<button class="btn small" ${attr}="${id}" aria-label="${esc(label)}（${zeni(cost)}）">${zeni(cost)}で${label}</button>`;

export function toiyaHtml(G) {
  const T = tomoAlive(G), cap = tomoCap(G);
  const wage = T.reduce((a, t) => a + ((TOMO[t.kind] || {}).wage || 0), 0);
  const roku = (RANKS[G.rank] || RANKS[0]).roku || 1;
  const ride = ladderStep(G) >= 2;
  const horses = G.horses || [];
  const head = `<div class="ty-head" role="status"><span>所持金</span><b>${zeni(G.kan)}</b>
    <span>禄 ${zeni(roku)}／戦${wage ? `　・　供の給金 −${zeni(wage)}／戦` : ''}</span>
    <span>戦を終えると、戦功・任務・討ち取り・分捕りに応じて褒美が出る</span></div>`;
  // 供
  const tomoNow = T.length ? `<div class="ty-tomo" aria-label="いまの供">${T.map((t) => `<div class="tt"><span>${esc(t.name)}<small>　${esc(TOMO[t.kind].name)}・${t.battles || 0}戦</small></span><button class="btn small" data-ty-fire="${t.id}" aria-label="${esc(t.name)}に暇を出す">暇を出す</button></div>`).join('')}</div>` : '<p class="note" style="margin:2px 0 8px">まだ供はいない。雇えば戦で自分のすぐ後ろについて戦う。</p>';
  const tomoCards = Object.entries(TOMO).map(([k, d]) => {
    const full = T.length >= cap;
    const w = full ? `連れて行けるのは${cap}人まで（身分が上がると増える）` : why(G, d.hire);
    return `<div class="item"><div class="n">${esc(d.name)}<small class="pr">雇い賃 ${zeni(d.hire)}・給金 ${zeni(d.wage)}／戦</small></div>
      <div class="x">${esc(d.note)}<span class="ty-can">戦でついて来る供が一人増える</span></div>
      <div class="a">${w ? `<span class="ty-why">${esc(w)}</span>` : buyBtn('data-ty-hire', k, d.hire, '雇う')}</div></div>`;
  }).join('');
  // 飛び道具
  const ranged = ['teppo', 'yumi'].map((id) => {
    const it = ITEMS[id];
    const own = G.owned.includes(id);
    const w = own ? '' : why(G, it.cost, it.minRank);
    return `<div class="item ${own ? 'eq' : ''}"><div class="n">${esc(it.name)}<small class="pr">${zeni(it.cost)}</small></div>
      <div class="x">${esc(isTouch ? it.note.replace(/数字キー[34]で持ち替え。/, '右下の持ち替えの丸で持ち替え。').replace('右で構えて狙い', '構えの丸で狙い').replace('左で撃つ', '突きの丸で撃つ').replace('左を押して引き絞り、離して射る', '突きの丸を押して引き絞り、離して射る') : it.note)}<span class="ty-can">${id === 'teppo' ? '戦の中で持ち替えて、遠くの敵を撃てる' : '戦の中で持ち替えて、矢を射かけられる'}</span></div>
      <div class="a">${own ? `<span class="ty-own">所持（${SWAP(id === 'teppo' ? 3 : 4)}持ち替え）</span>` : w ? `<span class="ty-why">${esc(w)}</span>` : buyBtn('data-ty-buy', id, it.cost)}</div></div>`;
  }).join('');
  // 馬（分捕り馬は買えないので並べない）
  const bar = (v) => `<i class="hb"><b style="width:${Math.round(Math.min(1, v / 1.4) * 100)}%"></b></i>`;
  const horseCards = Object.entries(HORSES).filter(([, h]) => !h.spoil).map(([id, h]) => {
    const own = horses.includes(id) && (id !== 'tsukikage' || ride);
    let act;
    if (id === 'tsukikage' && !ride) act = '<span class="ty-own">足軽大将になると賜る</span>';
    else if (own) act = '<span class="ty-own">所持（馬屋で乗り換え）</span>';
    else { const w = why(G, h.cost); act = w ? `<span class="ty-why">${esc(w)}</span>` : buyBtn('data-ty-horse', id, h.cost); }
    return `<div class="item ${own ? 'eq' : ''}"><div class="n">${h.grade && h.grade !== h.name ? `${esc(h.grade)}「${esc(h.name)}」` : esc(h.name)}<small class="pr">${id === 'tsukikage' ? '賜り物' : zeni(h.cost)}</small></div>
      <div class="x">${esc(h.kind)}。${esc(h.note)}<span class="hst">速さ${bar(h.speed)}体力${bar(h.hp)}息${bar(h.breath)}</span><span class="ty-can">${ride ? '馬屋で乗り換えて、馬上で戦える' : '足軽大将になった時、この馬に乗って出陣できる'}</span></div>
      <div class="a">${act}</div></div>`;
  }).join('');
  // 槍・刀・具足
  const SLOT = { weapon: '槍', side: '刀', hat: '兜・笠', body: '胴', arm: '籠手', thigh: '佩楯', shin: '脛当', coat: '陣羽織' };
  const gear = Object.entries(ITEMS).filter(([, it]) => it.cost && SLOT[it.slot]).map(([id, it]) => {
    const own = G.owned.includes(id);
    const w = own ? '' : why(G, it.cost, it.minRank);
    return `<div class="item ${own ? 'eq' : ''}"><div class="n">${esc(it.name)}<small>${SLOT[it.slot]}</small><small class="pr">${zeni(it.cost)}</small></div>
      <div class="x">${esc(it.note)}</div>
      <div class="a">${own ? '<span class="ty-own">所持（武具屋で着ける）</span>' : w ? `<span class="ty-why">${esc(w)}</span>` : buyBtn('data-ty-buy', id, it.cost)}</div></div>`;
  }).join('');
  return `${CSS}<div class="toiya">${head}
    <div class="ty-sec"><h4>供（ともの者）</h4><small>連れて行ける数 ${T.length}／${cap}人（${esc(RANKS[G.rank].name)}）・討たれた供は戻らない</small></div>${tomoNow}<div class="items">${tomoCards}</div>
    <div class="ty-sec"><h4>飛び道具</h4><small>槍・刀と持ち替えて使う</small></div><div class="items">${ranged}</div>
    <div class="ty-sec"><h4>馬</h4><small>乗れるのは足軽大将から。先に買っておける</small></div><div class="items">${horseCards}</div>
    <div class="ty-sec"><h4>槍・刀・具足</h4><small>買った物は武具屋で着け替える</small></div><div class="items">${gear}</div>
  </div>`;
}

// いまの銭で買える物・雇える供があるか（札の印に使う）
export function toiyaCheap(G) {
  if (tomoAlive(G).length < tomoCap(G) && Object.values(TOMO).some((d) => d.hire <= (G.kan || 0))) return true;
  return ['teppo', 'yumi'].some((id) => !G.owned.includes(id) && ITEMS[id].cost <= (G.kan || 0));
}

// 釦をつなぐ。done(知らせ) で保存して描き直す
export function toiyaBind(G, done) {
  document.querySelectorAll('[data-ty-hire]').forEach((b) => b.onclick = () => {
    const d = TOMO[b.dataset.tyHire];
    if (!d || (G.kan || 0) < d.hire || tomoAlive(G).length >= tomoCap(G)) return;
    addKan(G, -d.hire);
    G.tomo = G.tomo || [];
    const t = newTomo(G, b.dataset.tyHire);
    G.tomo.push(t);
    done(`${d.name}の${t.name}を雇った（給金 ${zeni(d.wage)}／戦）`, 'merit');
  });
  document.querySelectorAll('[data-ty-buy]').forEach((b) => b.onclick = () => {
    const id = b.dataset.tyBuy, it = ITEMS[id];
    if (!it || G.owned.includes(id) || (G.kan || 0) < it.cost || (it.minRank && G.rank < it.minRank)) return;
    addKan(G, -it.cost);
    G.owned.push(id);
    // 着ける物は、買ったらすぐ着ける（武具屋と同じ）
    if (G.equip && it.slot in G.equip && it.slot !== 'side') G.equip[it.slot] = id;
    done(`${it.name}を買った`, 'merit');
  });
  document.querySelectorAll('[data-ty-horse]').forEach((b) => b.onclick = () => {
    const id = b.dataset.tyHorse, h = HORSES[id];
    if (!h || h.spoil || (G.kan || 0) < h.cost) return;
    addKan(G, -h.cost);
    // 乗り換える前に、いまの馬の絆と名を覚えておく（馬屋と同じ）
    const c = G.horse || { id: 'tsukikage', bond: 0 };
    G.horseBonds = { ...(G.horseBonds || {}), [c.id]: c };
    G.horses = [...(G.horses || ['tsukikage']), id];
    G.horse = { id, bond: 0 };
    done(`${h.grade}「${h.name}」を買った${ladderStep(G) >= 2 ? '' : '（足軽大将になれば乗れる）'}`, 'neigh');
  });
  document.querySelectorAll('[data-ty-fire]').forEach((b) => b.onclick = () => {
    const t = (G.tomo || []).find((x) => x.id === b.dataset.tyFire);
    if (!t) return;
    // 取り消せないので、二度押しで確かめる
    if (b.dataset.sure !== '1') { b.dataset.sure = '1'; b.textContent = 'もう一度押すと暇を出す'; b.classList.add('primary'); return; }
    G.tomo = G.tomo.filter((x) => x !== t);
    done(`${t.name}に暇を出した`, 'ui');
  });
}
