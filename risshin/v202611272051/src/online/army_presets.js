// K587 軍団の型（プリセット・docs/online_extra_1120.md 60・18 の割り 11/27 → クラウド k365-cloud-05）
//   自分の軍団（出陣の武将とその並び・置き場・陣形・兵種の型・布陣帳）を最大5つ残し、編成の画面と布陣の画面からひと押しで呼び出す。
//   持ち物の箱（house.js の loadOnline/saveOnline）の o.presets に置く。呼び出した型に、持っていない武将・開いていない枠・Cost の上限を越える者がいれば外し、
//   外した武将の顔に印（鍵＝持っていない・枠＝開いていない・天秤＝Cost 越え）を付けて見せる（字でなく絵で）。match.js には触らない。
import { bushoOf, costOf, saveOnline, face, esc } from './house.js';
import { isEn, addEn, tr } from '../i18n.js';
// 編成の画面の釦の字（hensei_ui.js の『型』）の英語
if (isEn()) addEn([['型', 'Presets'], ['軍団の型', 'Army presets']]);

export const PRESET_MAX = 5;
const T = (ja, en) => (isEn() ? en : ja);
const NM = (n) => (isEn() ? tr(n) : n);   // 読み上げの武将の名（英語の時は英語の名）
const clone = (v) => JSON.parse(JSON.stringify(v ?? null));

/** 残した型の一覧（五つの枠。空は null） */
export function presetsOf(o) {
  const L = Array.isArray(o?.presets) ? o.presets.slice(0, PRESET_MAX) : [];
  while (L.length < PRESET_MAX) L.push(null);
  return L.map((p) => (p && Array.isArray(p.army) ? p : null));
}

/** 今の軍団を i 番目の枠に残す。st = { army: [名|null], slots, defaultFujin } */
export function savePreset(o, i, st) {
  if (!o || i < 0 || i >= PRESET_MAX) return null;
  const L = presetsOf(o);
  const army = (st.army || []).slice();
  const kata = {}; for (const n of army) if (n && o.kata?.[n]) kata[n] = o.kata[n];
  L[i] = { army, slots: st.slots || army.length, fujin: clone(st.defaultFujin), kata, at: Date.now() };
  o.presets = L;
  saveOnline(o);
  return L[i];
}

/** 型を今の持ち物に合わせる。返す物 { army, fujin, kata, removed: [{ name, why: 'none'|'slot'|'cost' }] }
 *  N＝今開いている枠の数・cap＝Cost の上限の表（capOf）・vcost＝家臣の Cost の和（vassalCost）。総大将（一番目）は Cost に数えない */
export function fitPreset(o, p, N, capOf, vcost) {
  const owned = new Set(o?.owned || []), removed = [];
  let army = (p?.army || []).map((n) => {
    if (!n) return null;
    if (!owned.has(n) || !bushoOf(n)) { removed.push({ name: n, why: 'none' }); return null; }
    return n;
  });
  // 開いていない枠の者（型を残した後に枠の数が減る事は無いが、別の端末の箱などに備える）
  if (army.length > N) { for (const n of army.slice(N)) if (n) removed.push({ name: n, why: 'slot' }); army = army.slice(0, N); }
  while (army.length < N) army.push(null);
  // Cost の上限：越える間、家臣のうち Cost の大きい者から外す（総大将は残す）
  const cap = capOf(N);
  while (vcost(army) > cap) {
    let k = -1; for (let j = 1; j < army.length; j++) if (army[j] && (k < 0 || costOf(army[j]) > costOf(army[k]))) k = j;
    if (k < 0) break;
    removed.push({ name: army[k], why: 'cost' }); army[k] = null;
  }
  const keep = new Set(army.filter(Boolean));
  const fujin = p?.fujin ? { ...clone(p.fujin), pieces: (p.fujin.pieces || []).filter((q) => keep.has(q.name)) } : null;
  const kata = {}; for (const n of keep) if (p?.kata?.[n]) kata[n] = p.kata[n];
  return { army, fujin, kata, removed };
}

const CSS = `
.apr-ov{position:absolute;inset:0;background:#000b;display:flex;align-items:center;justify-content:center;padding:10px;z-index:6}
.apr-box{width:min(560px,100%);max-height:100%;overflow:auto;background:#1d1710;border:1px solid #d9b45a;border-radius:6px;padding:10px 12px;display:flex;flex-direction:column;gap:6px;color:#ece4d2}
.apr-box h3{margin:0;font-size:16px;color:#d9b45a;display:flex;align-items:center;gap:8px}
.apr-row{display:flex;align-items:center;gap:8px;min-height:48px;border:1px solid #6a5a3a;border-radius:6px;padding:2px 6px;background:#14110ccc}
.apr-row .apr-no{flex:none;width:28px;height:28px;border-radius:50%;border:1.5px solid #c2a25a;display:flex;align-items:center;justify-content:center;font-weight:700;color:#f3d68a}
.apr-row .apr-faces{flex:1;min-width:0;display:flex;gap:3px;overflow:hidden}
.apr-row .apr-face{flex:none;width:40px;height:40px;border-radius:4px;overflow:hidden;background:#0d0a07;position:relative}
.apr-row .apr-face img{width:100%;height:100%;object-fit:cover}
.apr-row .apr-empty{flex:1;height:40px;border:1px dashed #6a5a3a;border-radius:4px}
.apr-row button,.apr-close{flex:none;min-width:72px;min-height:44px;padding:0 10px;border:1px solid #8a7350;border-radius:4px;background:#0007;color:#ece4d2;font-size:14px}
.apr-row button.go{border-color:#e0a070;background:linear-gradient(180deg,#c0482e,#8e2a1e)}
.apr-row button:disabled{opacity:.4}
.apr-close{align-self:flex-end}
.apr-note{position:absolute;left:50%;top:56px;transform:translateX(-50%);display:flex;gap:6px;align-items:center;padding:6px 10px;border:1px solid #e3826a;border-radius:6px;background:#1d1710ee;z-index:7;pointer-events:none}
.apr-note .apr-face{width:40px;height:40px;position:relative;border-radius:4px;overflow:hidden;background:#0d0a07}
.apr-note .apr-face img{width:100%;height:100%;object-fit:cover}
.apr-x{position:absolute;inset:0;pointer-events:none}
.apr-why{position:absolute;right:1px;bottom:1px;width:18px;height:18px;border-radius:50%;background:#8a2a1f;display:flex;align-items:center;justify-content:center}
.apr-why svg{width:12px;height:12px}
`;
// 外した訳の印：鍵＝持っていない・枠＝開いていない・天秤＝Cost の上限
const WHY_IC = {
  none: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" fill="#fff"/><path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="#fff" stroke-width="2.4" fill="none"/></svg>',
  slot: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="2" stroke="#fff" stroke-width="2.4" fill="none"/><path d="M8 12h8" stroke="#fff" stroke-width="2.4"/></svg>',
  cost: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v18M5 7h14M5 7l-3 7h6zM19 7l-3 7h6z" stroke="#fff" stroke-width="2" fill="#fff"/></svg>',
};
const WHY_LABEL = { none: ['持っていない', 'not owned'], slot: ['枠が開いていない', 'slot locked'], cost: ['Cost の上限を越える', 'over the cost cap'] };
const X_SVG = '<svg class="apr-x" viewBox="0 0 40 40" aria-hidden="true"><path d="M6 6L34 34M34 6L6 34" stroke="#e3826a" stroke-width="4" stroke-linecap="round"/></svg>';
const SAVE_IC = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M5 3h11l3 3v15H5z" stroke="currentColor" stroke-width="2" fill="none"/><path d="M8 3v6h7V3M8 21v-7h8v7" stroke="currentColor" stroke-width="2" fill="none"/></svg>';

function css(host) {
  if (!host.querySelector(':scope > style.apr-css')) { const s = document.createElement('style'); s.className = 'apr-css'; s.textContent = CSS; host.appendChild(s); }
}
function faceBox(name, why) {
  const d = document.createElement('div'); d.className = 'apr-face'; d.title = NM(name); d.setAttribute('aria-label', NM(name) + (why ? T('：', ': ') + T(WHY_LABEL[why][0], WHY_LABEL[why][1]) : ''));
  try { face(d, name); } catch (e) { /* 顔が無くても枠は出す */ }
  if (why) { d.insertAdjacentHTML('beforeend', X_SVG + `<span class="apr-why">${WHY_IC[why]}</span>`); }
  return d;
}

/** 外した武将を、顔に×と訳の印を付けて上に三秒半出す（字でなく絵で。読み上げには名と訳） */
export function showRemoved(host, removed) {
  if (!host || !removed?.length) return;
  css(host);
  host.querySelector(':scope > .apr-note')?.remove();
  const n = document.createElement('div'); n.className = 'apr-note'; n.setAttribute('role', 'status');
  n.setAttribute('aria-label', T('型から外した武将：', 'Removed from the preset: ') + removed.map((r) => NM(r.name)).join(isEn() ? ', ' : '・'));
  for (const r of removed.slice(0, 8)) n.appendChild(faceBox(r.name, r.why));
  host.appendChild(n);
  setTimeout(() => n.remove(), 3500);
}

/** 型の札：五つの枠。o＝持ち物の箱。getState()＝今の軍団（残す時）。onApply(fit)＝呼び出した時（画面の側で軍団を入れ替える）。loadOnly＝呼び出しだけ（布陣の画面） */
export function openPresets(host, o, { getState, onApply, loadOnly = false, N, capOf, vcost }) {
  css(host);
  host.querySelector(':scope > .apr-ov')?.remove();
  const ov = document.createElement('div'); ov.className = 'apr-ov';
  const box = document.createElement('div'); box.className = 'apr-box'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', T('軍団の型', 'Army presets'));
  ov.appendChild(box); host.appendChild(ov);
  const close = () => ov.remove();
  ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
  const draw = () => {
    box.innerHTML = `<h3>${SAVE_IC}${esc(T('軍団の型', 'Army presets'))}</h3>`;
    presetsOf(o).forEach((p, i) => {
      const row = document.createElement('div'); row.className = 'apr-row';
      row.insertAdjacentHTML('beforeend', `<span class="apr-no" aria-hidden="true">${i + 1}</span>`);
      const fs = document.createElement('div'); fs.className = 'apr-faces';
      if (p) for (const n of p.army.filter(Boolean)) fs.appendChild(faceBox(n, null));
      else fs.innerHTML = '<span class="apr-empty" aria-hidden="true"></span>';
      fs.setAttribute('aria-label', p ? p.army.filter(Boolean).map(NM).join(isEn() ? ', ' : '・') : T('空き', 'Empty'));
      row.appendChild(fs);
      if (!loadOnly) {
        const sv = document.createElement('button'); sv.type = 'button'; sv.textContent = T('残す', 'Save'); sv.setAttribute('aria-label', T(`型${i + 1}に今の軍団を残す`, `Save the current army to preset ${i + 1}`));
        sv.addEventListener('click', () => { const st = getState(); if (!st?.army?.some(Boolean)) return; savePreset(o, i, st); draw(); });
        row.appendChild(sv);
      }
      const ld = document.createElement('button'); ld.type = 'button'; ld.className = 'go'; ld.textContent = T('呼び出す', 'Load'); ld.disabled = !p;
      ld.setAttribute('aria-label', T(`型${i + 1}を呼び出す`, `Load preset ${i + 1}`));
      ld.addEventListener('click', () => { if (!p) return; const fit = fitPreset(o, p, N(), capOf, vcost); close(); onApply(fit); showRemoved(host, fit.removed); });
      row.appendChild(ld);
      box.appendChild(row);
    });
    const cl = document.createElement('button'); cl.type = 'button'; cl.className = 'apr-close'; cl.textContent = T('閉じる', 'Close');
    cl.addEventListener('click', close); box.appendChild(cl);
    box.querySelector('button:not(:disabled)')?.focus({ preventScroll: true });
  };
  draw();
  return ov;
}
