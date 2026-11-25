// 毎日の理由の画面（daily_war.js の決まりを見せる）：ホームの三つの札と、歴史軍団の一覧。字は少なく・絵（家紋・段の升・済の印）で。
import { isEn } from '../i18n.js';
import { HOUSES, monCanvas, loadOnline, root, esc } from './house.js';
import { todayFoe, weekTheme, legionList, ringView, RING_DAYS } from './daily_war.js';

const mon = (house) => HOUSES.find((h) => h.id === house)?.mon || 'oda';
const won = (save, o) => { const d = save?.npcHonors?.daily; return o.kind === 'day' ? !!d?.days?.[o.id] : o.kind === 'week' ? !!d?.weeks?.[o.id] : !!d?.legion?.[o.id]; };
// ホームの三つの札：今日の敵軍・今週の題・歴史軍団。pick(foe) で戦いの支度の画面へ。済んだ物は金の丸
export function dailyStrip(save, pick, openLegion) {
  const en = isEn(), d = todayFoe(), w = weekTheme(), box = document.createElement('div'); box.className = 'olm-dstrip';
  const mk = (cls, o, title, sub, onclick) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'olm-d ' + cls; b.dataset.d = o.kind || cls;
    const ok = o.kind && won(save, o);
    b.setAttribute('aria-label', `${title}・${sub}${ok ? (en ? ' (cleared)' : '・済') : ''}`);
    b.innerHTML = `<i class="m"></i><span><b>${esc(title)}</b><small>${esc(sub)}</small></span>${o.kind ? `<em class="${ok ? 'ok' : 'new'}" aria-hidden="true"></em>` : ''}`;
    b.querySelector('.m').appendChild(monCanvas(mon(o.house), 30, 30));
    b.onclick = onclick; box.appendChild(b); return b;
  };
  mk('day', d, en ? d.en : d.name, en ? 'Today' : '今日の敵軍', () => pick(d));
  const wb = mk('week', w, en ? w.en : w.name, en ? 'This week' : '今週の題', () => pick(w));
  { const rv = ringView(save), r = document.createElement('span'); r.className = 'ring'; r.setAttribute('aria-label', (en ? 'Seven-day ring ' : '七日の輪 ') + `${rv.n}/${RING_DAYS}`);   // N3：七日の輪（点七つ・七つ目は金）
    for (let i = 0; i < RING_DAYS; i++) { const c = document.createElement('i'); if (i < rv.n) c.className = 'on'; if (i === RING_DAYS - 1) c.className += ' big'; r.appendChild(c); } wb.querySelector('span').appendChild(r); }
  const L = legionList(save), n = L.filter((x) => x.won).length;
  const lb = document.createElement('button'); lb.type = 'button'; lb.className = 'olm-d legion'; lb.dataset.d = 'legion';
  lb.setAttribute('aria-label', (en ? 'Historic legions ' : '歴史軍団 ') + `${n}/${L.length}`);
  lb.innerHTML = `<span class="dan">${'<i></i>'.repeat(L.length)}</span><span><b>${en ? 'Historic legions' : '歴史軍団'}</b><small>${n}/${L.length}</small></span>`;
  lb.querySelectorAll('.dan i').forEach((c, i) => { c.className = L[i].won ? 'on' : ''; });
  lb.onclick = openLegion; box.appendChild(lb);
  return box;
}
export const DAILY_CSS = `.olh .olm-dstrip{grid-column:1 / -1;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.olh .olm-d{position:relative;display:flex;align-items:center;gap:6px;min-height:44px;padding:4px 8px;border:1px solid #6a5a3a;border-radius:6px;background:#17130ecc;color:inherit;font:inherit;text-align:left}
.olh .olm-d b{display:block;font-size:14px;line-height:1.2}.olh .olm-d small{display:block;font-size:12px;opacity:.85}
.olh .olm-d .m{flex:none}.olh .olm-d em{position:absolute;top:4px;right:4px;width:10px;height:10px;border-radius:50%}
.olh .olm-d em.new{background:#d23a26;box-shadow:0 0 0 2px #f4d98a}.olh .olm-d em.ok{background:#e6c77a}
.olh .olm-d .dan{display:grid;grid-template-columns:repeat(5,6px);gap:2px;flex:none}.olh .olm-d .dan i{width:6px;height:6px;border:1px solid #8a6a40;border-radius:50%}.olh .olm-d .dan i.on{background:#e6c77a;border-color:#e6c77a}
.olh .ol-lg{display:flex;align-items:center;gap:10px;min-height:56px;padding:6px 10px;border:1px solid #6a5a3a;border-radius:6px;background:#17130ecc;color:inherit;font:inherit;text-align:left;width:100%}
.olh .ol-lg.won{border-color:#e6c77a}.olh .ol-lg .st{margin-left:auto;display:flex;gap:2px}.olh .ol-lg .st i{width:8px;height:8px;border-radius:50%;background:#4a3a2a}.olh .ol-lg .st i.on{background:#d23a26}
.olh .ol-lglist{flex:1;min-height:0;overflow-y:auto;display:flex;flex-direction:column;gap:8px;padding:8px 0}

.olh .olm-d .ring{display:flex;gap:3px;margin-top:3px}.olh .olm-d .ring i{width:7px;height:7px;border:1px solid #8a6a40;border-radius:50%}.olh .olm-d .ring i.on{background:#e6c77a}.olh .olm-d .ring i.big{width:9px;height:9px;border-color:#e6c77a}
@media (max-width:720px){.olh .olm-dstrip{grid-template-columns:1fr}}`;
// 歴史軍団の一覧：一段から十段まで。押すと戦いの支度の画面へ（pick）
export function openLegions(save, pick, onBack) {
  const en = isEn(), el = root(en ? 'Historic legions' : '歴史軍団');
  el.querySelector('style').insertAdjacentText('beforeend', DAILY_CSS);
  el.insertAdjacentHTML('beforeend', `<div class="ol-top"><button type="button" class="ol-back" aria-label="${en ? 'Back' : '戻る'}">‹</button><h2>${en ? 'Historic legions' : '歴史軍団'}</h2></div><div class="ol-lglist" role="list"></div>`);
  const list = el.querySelector('.ol-lglist');
  for (const L of legionList(save)) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'ol-lg' + (L.won ? ' won' : ''); b.setAttribute('role', 'listitem');
    const nm = en ? L.en : L.name;
    b.setAttribute('aria-label', `${L.year} ${nm} ${L.dan}${en ? '' : '段'}${L.won ? (en ? ' cleared' : ' 済') : ''}`);
    b.innerHTML = `<i class="m"></i><span><b>${L.year}　${esc(nm)}</b><small>${en ? 'Rank ' : ''}${L.dan}${en ? '' : '段'}${L.won ? '　' + (en ? 'cleared' : '済') : '　' + (en ? '+' : '武将印 ') + L.reward.seals}</small></span><span class="st">${'<i></i>'.repeat(10)}</span>`;
    b.querySelector('.m').appendChild(monCanvas(mon(L.house), 34, 34));
    b.querySelectorAll('.st i').forEach((c, i) => { if (i < L.dan) c.className = 'on'; });
    b.onclick = () => { el.remove(); pick(L); };
    list.appendChild(b);
  }
  el.querySelector('.ol-back').addEventListener('click', () => { el.remove(); onBack && onBack(); });
  return el;
}
