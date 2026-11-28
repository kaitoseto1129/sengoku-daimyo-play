// 武将の札（33・11/21・kaito の指示書 docs/online_final_1120.md 120「軍団編成の画面：各武将をタップすると能力・兵種・陣形・固有戦術」・
//   docs/online_extra_1120.md 45「引いたら…固有戦術を見られる（図鑑）」の、今ある表で出せる所）。
//   openBushoCard(name, { onClose }) で開く。出す物：顔・名・格・家・コスト・得意の兵種（絵と名）・七つの能力（棒と数）・固有戦術（名と働き）か常の効き。
//   生年・没年・主な合戦・人物の概要は bushou_history.js（33 が作った史の表・iMac③ の表が来たら照らして直す）。押せる所は 44px。
import { BUSHOU_ONLINE, HOUSE_NAME, statsOf, STAT_KEYS } from './bushou_online.js';
import { BUSHO_TACTIC, BUSHO_PASSIVE, TACTICS, PASSIVES } from './tactics.js';
import { KATA, RARITY, face, kataCanvas, esc } from './house.js';
import { isEn, tr } from '../i18n.js';
import { historyOf, yearText } from './bushou_history.js';

const STAT_JA = { COMMAND: '指揮', MORALE: '士気', COHESION: '結束', TACTICS: '戦術', MOBILITY: '機動', RANGED: '射撃', SIEGE: '攻城' };
const STAT_EN = { COMMAND: 'Command', MORALE: 'Morale', COHESION: 'Cohesion', TACTICS: 'Tactics', MOBILITY: 'Mobility', RANGED: 'Ranged', SIEGE: 'Siege' };
const CSS = `
.bkc{position:fixed;inset:0;z-index:9500;display:flex;align-items:center;justify-content:center;background:#0b0806e6;color:#f1e9d6;font:15px/1.45 "Noto Serif JP","Hiragino Mincho ProN",serif;
  padding:max(8px,env(safe-area-inset-top)) max(16px,env(safe-area-inset-right)) max(8px,env(safe-area-inset-bottom)) max(16px,env(safe-area-inset-left));box-sizing:border-box}
.bkc *{box-sizing:border-box}
.bkc-box{width:min(640px,100%);max-height:100%;overflow:auto;background:#1c1813;border:1px solid #8a7350;border-radius:6px;padding:10px 14px;display:grid;grid-template-columns:auto 1fr;gap:6px 14px}
.bkc-face{width:84px;height:84px;border-radius:50%;border:3px solid var(--rc,#8a7350);overflow:hidden;grid-row:span 2}
.bkc-face canvas,.bkc-face img{width:100%;height:100%}
.bkc h2{margin:0;font-size:20px;color:#e8c77a;font-weight:600}
.bkc-sub{font-size:14px;opacity:.9;display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.bkc-rare{padding:0 8px;border:1px solid var(--rc,#8a7350);border-radius:10px;color:var(--rc,#e8c77a)}
.bkc-stats{grid-column:1 / -1;display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:4px 16px}
.bkc-st{display:grid;grid-template-columns:4em 1fr 2.2em;align-items:center;gap:6px;font-size:14px}
.bkc-bar{height:8px;background:#0008;border-radius:4px;overflow:hidden}
.bkc-bar i{display:block;height:100%;background:#c9a24a}
.bkc-tac{grid-column:1 / -1;border-top:1px solid #3a2f22;padding-top:6px;font-size:14px}
.bkc-tac b{color:#f3d68a;font-size:15px}
.bkc-his{grid-column:1 / -1;border-top:1px solid #3a2f22;padding-top:6px;font-size:14px}
.bkc-his p{margin:2px 0}
.bkc-his .yr{color:#e8c77a}
.bkc-foot{grid-column:1 / -1;display:flex;justify-content:center}
.bkc button{font:inherit;color:inherit;min-height:44px;min-width:160px;border-radius:4px;cursor:pointer;border:1px solid #8a7350;background:#0007;padding:4px 14px}
`;

export function bushoCardData(name) {
  const b = BUSHOU_ONLINE.find((q) => q.name === name);
  if (!b) return null;
  const st = statsOf(b) || {};
  const tid = BUSHO_TACTIC[name], pid = BUSHO_PASSIVE?.[name];
  const tac = tid ? { kind: 'tactic', id: tid, name: TACTICS[tid]?.name, en: TACTICS[tid]?.en, desc: TACTICS[tid]?.desc, uses: TACTICS[tid]?.uses }
    : pid ? { kind: 'passive', id: pid, name: PASSIVES[pid]?.name } : null;
  return { name, id: b.id, rank: b.rank, house: b.house, cost: b.cost, fav: b.fav || 'std', stats: STAT_KEYS.map((k) => [k, Math.round(st[k] ?? 0)]), tac, his: historyOf(b.id) };
}

export function openBushoCard(name, o = {}) {
  const d = bushoCardData(name); if (!d || typeof document === 'undefined') return null;
  if (!document.getElementById('bkc-css')) { const s = document.createElement('style'); s.id = 'bkc-css'; s.textContent = CSS; document.head.appendChild(s); }
  const en = isEn(), T = (s) => (en ? tr(s) : s);
  const el = document.createElement('div'); el.className = 'bkc'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', T(name));
  const rc = RARITY[d.rank]?.color || '#8a7350', kata = KATA.find((k) => k.id === d.fav);
  const tac = d.tac ? (d.tac.kind === 'tactic'
    ? `${en ? 'Special tactic' : '固有戦術'}　<b>${esc(en ? d.tac.en || T(d.tac.name) : d.tac.name)}</b>${!en && d.tac.desc ? `<br>${esc(d.tac.desc)}` : ''}${d.tac.uses ? `<br><small>${en ? `${d.tac.uses} per battle` : `一戦に${d.tac.uses}回`}</small>` : ''}`
    : `${en ? 'Steady effect' : '常の効き'}　<b>${esc(T(d.tac.name))}</b>`) : (en ? 'No special tactic' : '固有戦術なし');
  el.innerHTML = `<div class="bkc-box">
    <div class="bkc-face" style="--rc:${rc}"></div>
    <h2>${esc(T(name))}</h2>
    <div class="bkc-sub"><span class="bkc-rare" style="--rc:${rc}">${d.rank}</span><span>${esc(T(HOUSE_NAME[d.house] || ''))}</span><span>${en ? 'Cost' : 'コスト'} ${d.cost}</span>
      <span class="bkc-kata" aria-label="${esc(T(kata?.name || ''))}"></span><span>${esc(T(kata?.name || ''))}</span></div>
    <div class="bkc-stats">${d.stats.map(([k, v]) => `<div class="bkc-st"><span>${en ? STAT_EN[k] : STAT_JA[k]}</span><div class="bkc-bar" aria-hidden="true"><i style="width:${Math.max(0, Math.min(100, v))}%"></i></div><span>${v}</span></div>`).join('')}</div>
    <div class="bkc-tac">${tac}</div>
    ${d.his ? `<div class="bkc-his"><p class="yr">${yearText(d.his.born, en)} – ${yearText(d.his.died, en)}</p>
      <p>${en ? 'Battles' : '主な合戦'}　${esc((en ? d.his.battlesEn : d.his.battles).join(en ? ', ' : '・'))}</p><p>${esc(en ? d.his.en : d.his.ja)}</p></div>` : ''}
    <div class="bkc-foot"><button type="button" data-a="close">${en ? 'Close' : '閉じる'}</button></div></div>`;
  try { face(el.querySelector('.bkc-face'), name); } catch (e) { /* 顔の絵が無くても札は出す */ }
  try { el.querySelector('.bkc-kata').appendChild(kataCanvas(d.fav, 20)); } catch (e) { /* 絵が無くてもよい */ }
  const close = () => { el.remove(); o.onClose && o.onClose(); };
  el.addEventListener('click', (e) => { if (e.target === el || e.target.closest('[data-a="close"]')) close(); });
  (o.root || document.body).appendChild(el);
  el.querySelector('[data-a="close"]').focus({ preventScroll: true });
  return { el, close };
}
