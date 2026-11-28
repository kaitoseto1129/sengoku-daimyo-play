// K587 お気に入りの武将と絞り込み（docs/online_extra_1120.md 75「100人を超えるので、お気に入り・家・兵種・レアの絞り込みが要る」・11/27 クラウド25）
//   字は少なく：お気に入り＝星、家＝家紋、兵種＝兵種の絵、格＝色の丸。字は読み上げ（aria-label）にだけ。
//   お気に入りは持ち物の箱（house.js の loadOnline/saveOnline）の fav（武将の名の並び）。
//   武将の一覧（home_ui.js の openRoster）：attachRoster(el, list) の一行で、絞りの札と、札ごとの星（押して付け外し）を足す。
//   軍団の編成（hensei_ui.js）：attachHensei(el) の一行で、今ある絞り（兵種・格・家）の頭に星の札を足し、お気に入りの札に小さな星を付ける。
import { HOUSES, RARITY, loadOnline, saveOnline, monCanvas, lbl, lw } from './house.js';
import { unitOf, unitIcon } from './unit_type.js';
import { isEn } from '../i18n.js';
const EN = { お気に入り: 'Favorite', 当てはまる武将はいない: 'No generals match', 絞る: 'Filter', 騎馬: 'Cavalry', 鉄砲: 'Arquebus', 槍: 'Spear', 弓: 'Bow' };
const w = (j) => (isEn() ? EN[j] || lw(j) : j);

const STAR = (on, s = 20) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" aria-hidden="true"><path d="M12 2.6l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.4l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z" fill="${on ? '#f3c84a' : 'none'}" stroke="${on ? '#f3c84a' : '#cbbb98'}" stroke-width="1.8" stroke-linejoin="round"/></svg>`;
const RARES = ['SSR', 'SR', 'R', 'N'];
const KINDS = ['kiba', 'teppo', 'yari', 'yumi'];

export const favsOf = (o = loadOnline()) => (Array.isArray(o?.fav) ? o.fav.filter((x) => typeof x === 'string') : []);
export const isFav = (name, o = loadOnline()) => favsOf(o).includes(name);
export function toggleFav(name) {
  const o = loadOnline(); if (!o) return false;
  const f = favsOf(o), on = !f.includes(name);
  o.fav = on ? [...f, name] : f.filter((x) => x !== name);
  saveOnline(o);
  return on;
}

const CSS = `
.rf-bar{flex:none;display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:6px 0}
.rf-bar button{flex:none;min-height:44px;min-width:44px;padding:0 8px;border:1px solid #4a3f2c;border-radius:22px;background:#100d0a;display:flex;align-items:center;justify-content:center;gap:4px;color:#f3e6cc}
.rf-bar button[aria-pressed=true]{border-color:#d9b45a;background:#2e2414}
.rf-bar .rf-sep{width:1px;height:28px;background:#4a3f2c}
.rf-bar .rf-dot{width:16px;height:16px;border-radius:50%;background:var(--rc);box-shadow:0 0 0 2px rgba(0,0,0,.5)}
.rf-star{position:absolute;top:2px;left:2px;min-width:44px;min-height:44px;display:flex;align-items:flex-start;justify-content:flex-start;padding:2px;border:0;background:none;cursor:pointer}
.rf-mini{position:absolute;top:3px;left:3px;pointer-events:none;line-height:0}
.rf-none{padding:16px;color:#cbbb98;font-size:15px}
`;
function css(el) { if (!el.querySelector('style[data-rf]')) { const s = document.createElement('style'); s.dataset.rf = '1'; s.textContent = CSS; el.appendChild(s); } }

// 絞りの札（星・家紋・兵種の絵・格の色）。state を持ち、押すたびに onChange()
function makeBar(onChange) {
  const st = { fav: false, house: null, kind: null, rare: null };
  const bar = document.createElement('div'); bar.className = 'rf-bar'; bar.setAttribute('role', 'group'); bar.setAttribute('aria-label', w('絞る'));
  const add = (k, v, label, fill) => {
    const b = document.createElement('button'); b.type = 'button'; b.dataset.rk = k; b.dataset.rv = v; b.setAttribute('aria-label', label); b.setAttribute('aria-pressed', 'false');
    fill(b); bar.appendChild(b);
    b.addEventListener('click', () => { st[k] = k === 'fav' ? !st.fav : st[k] === v ? null : v; sync(); onChange(); });
  };
  const sep = () => { const s = document.createElement('i'); s.className = 'rf-sep'; s.setAttribute('aria-hidden', 'true'); bar.appendChild(s); };
  add('fav', '1', w('お気に入り'), (b) => { b.innerHTML = STAR(true); });
  sep();
  for (const h of HOUSES) add('house', h.id, w(h.name), (b) => b.appendChild(monCanvas(h.mon, 26, 26)));
  sep();
  for (const k of KINDS) add('kind', k, w({ kiba: '騎馬', teppo: '鉄砲', yari: '槍', yumi: '弓' }[k]), (b) => { b.innerHTML = unitIcon(k, 22); });
  sep();
  for (const r of RARES) add('rare', r, r, (b) => { b.innerHTML = `<i class="rf-dot" style="--rc:${RARITY[r].color}"></i>`; });
  const sync = () => bar.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.rk === 'fav' ? st.fav : st[b.dataset.rk] === b.dataset.rv)));
  const test = (b, favs) => !!b && (!st.fav || favs.includes(b.name)) && (!st.house || b.house === st.house) && (!st.kind || unitOf(b).id === st.kind) && (!st.rare || b.rare === st.rare);
  return { bar, st, test };
}

// 武将の一覧：list は openRoster が並べた順の武将（札と同じ順）
export function attachRoster(el, list) {
  const box = el?.querySelector('.olr'); if (!box) return null;
  css(el);
  const cards = [...box.children];
  const none = document.createElement('div'); none.className = 'rf-none'; none.hidden = true; none.setAttribute('role', 'status');
  const apply = () => {
    const favs = favsOf(); let n = 0;
    cards.forEach((c, i) => { const ok = F.test(list[i], favs); c.hidden = !ok; if (ok) n++; });
    none.hidden = n > 0; none.textContent = n ? '' : w('当てはまる武将はいない');
    const cnt = el.querySelector('.ol-top b'); if (cnt) cnt.textContent = n === cards.length ? String(n) : `${n}/${cards.length}`;
  };
  const F = makeBar(apply);
  box.before(F.bar); box.after(none);
  cards.forEach((c, i) => {
    const b = list[i]; if (!b) return;
    c.style.position = 'relative';
    const s = document.createElement('button'); s.type = 'button'; s.className = 'rf-star';
    const paint = () => { const on = isFav(b.name); s.innerHTML = STAR(on); s.setAttribute('aria-pressed', String(on)); };
    s.setAttribute('aria-label', lbl(w('お気に入り'), b.name));
    paint();
    s.addEventListener('click', (e) => { e.stopPropagation(); toggleFav(b.name); paint(); apply(); });
    s.addEventListener('keydown', (e) => e.stopPropagation());
    c.appendChild(s);
  });
  apply();
  return F;
}

// 軍団の編成：今ある絞り（.hz-filters）の頭に星の札。棚（.ol-shelf）を描き直すたびに、お気に入りに星を付け、星の札が押されていれば他を隠す
export function attachHensei(el) {
  const fl = el?.querySelector('.hz-filters'), shelf = el?.querySelector('.ol-shelf'); if (!fl || !shelf) return null;
  css(el);
  let on = false;
  const b = document.createElement('button'); b.type = 'button'; b.className = 'rf-favf'; b.setAttribute('aria-label', w('お気に入り')); b.setAttribute('aria-pressed', 'false'); b.innerHTML = STAR(true);
  const nameOf = (c) => c.querySelector('.ol-name')?.textContent || '';
  let busy = false;
  const apply = () => {
    if (busy) return; busy = true;
    const favs = new Set(favsOf().flatMap((n) => [n, lbl(n)]));   // 英語の時は札の名が英訳なので、両方で照らす
    for (const c of shelf.children) {
      const f = favs.has(nameOf(c));
      if (f && !c.querySelector('.rf-mini')) { c.style.position = 'relative'; c.insertAdjacentHTML('beforeend', `<span class="rf-mini" aria-hidden="true">${STAR(true, 14)}</span>`); }
      c.hidden = on && !f;
    }
    b.setAttribute('aria-pressed', String(on));
    busy = false;
  };
  b.addEventListener('click', () => { on = !on; apply(); });
  // ［全員］を押したら星の絞りも外す
  fl.querySelector('[data-f="all"]')?.addEventListener('click', () => { on = false; apply(); });
  fl.prepend(b);
  new MutationObserver(() => { if (el.isConnected) apply(); }).observe(shelf, { childList: true });
  apply();
  return { apply };
}
