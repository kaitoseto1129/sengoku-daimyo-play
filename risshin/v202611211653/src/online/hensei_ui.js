// 軍団の編成の画面。k365-cloud-48 が先に作り、cloud-24 へ渡し、11/21 K601 から iMac k598-tonya の受け持ち（docs/kaito_online_units_1121.md 20〜29・46〜48・56〜63）。
//   各枠＝顔の札・名・レア・主兵種・兵力 1000・Cost。上に「出陣武将 4/4・総兵力 4000・武将Cost 65/65」。
//   初めは4枠。第五陣 小判1,500・第六陣 小判3,000 で永久に開ける（最大6・サブスクでない・買ってすぐ使える。Web の版は無料で開ける）。Cost の上限は 4将 65・5将 80・6将 95。
//   K602：家の大名本人は総大将で、軍団から外せない。［騎馬］［鉄砲］［槍］［弓］［攻勢］［守備］［伏兵］で手持ちを絞る。［自動編成］騎馬中心・鉄砲中心。
//   枠を買えの札は登用の画面に出さない（ここで「第五陣 未解放」を見せるだけ）。
import { RARITY, ROSTER, bushoOf, costOf, armyCost, loadOnline, saveOnline, kinOf, face, root, esc, lbl, lw } from './house.js';
import { unitOf, keywordsOf, unitIcon, TROOPS } from './unit_type.js';
import { canBuyKin } from './kin_store.js';

export const SLOT_MAX = 6;
export const SLOT_PRICE = { 5: 1500, 6: 3000 };
export const capOf = (n) => ({ 4: 65, 5: 80, 6: 95 }[n] || 65);
export const slotsOf = (o) => Math.max(4, Math.min(SLOT_MAX, o?.slots || 4));
export const daimyoOf = (o) => ROSTER.find((b) => b.house === o?.house && b.start && b.rare === 'SS')?.name || null;
const ROLE = ['総大将', '左翼', '右翼', '後詰', '第五陣', '第六陣'];
const NUM = ['', '', '', '', '五', '六'];
const FILTERS = ['騎馬', '鉄砲', '槍', '弓', '攻勢', '守備', '伏兵'];
const n0 = (v) => Number(v).toLocaleString('ja-JP');

const CSS = `
.olh .hz-top{display:flex;align-items:center;gap:10px;min-height:44px;flex:none;flex-wrap:wrap}
.olh .hz-stat{display:flex;gap:6px 14px;align-items:center;flex-wrap:wrap;margin-left:auto;font-size:14px;color:#c9b98f}
.olh .hz-stat b{font-size:17px;color:#ece4d2;font-variant-numeric:tabular-nums;margin-left:4px}
.olh .hz-stat b.over{color:#e3826a}
.olh .hz-auto{min-height:44px;padding:0 12px;border:1px solid #c2a25a;border-radius:4px;background:#14120fcc}
.olh .hz-slots{flex:none;display:grid;grid-template-columns:repeat(var(--n),minmax(0,1fr));gap:8px;padding:6px 0}
.olh .hz-slot{position:relative;display:flex;flex-direction:column;gap:2px;align-items:center;justify-content:flex-start;border:1px solid #6a5a3a;border-radius:6px;background:#17130ecc;padding:20px 4px 4px;min-height:128px;min-width:0;text-align:center}
.olh .hz-slot[aria-pressed=true]{border:2px solid #d9b45a;background:#241b12}
.olh .hz-slot .ol-face{width:52px;height:52px;flex:none}
.olh .hz-info{display:flex;flex-direction:column;align-items:center;gap:1px;min-width:0;max-width:100%;font-size:12.5px;color:#c9b98f}
.olh .hz-role{position:absolute;top:3px;left:6px;font-size:12px;letter-spacing:.08em;color:#c9b98f}
.olh .hz-nm{font-size:14px;color:#ece4d2;line-height:1.25;display:flex;gap:4px;align-items:center;max-width:100%;white-space:nowrap}.olh .hz-nm i{font-style:normal;overflow:hidden;text-overflow:ellipsis}
.olh .hz-unit{white-space:nowrap;display:flex;align-items:center;gap:4px;color:#f3d68a;font-size:14px}
.olh .hz-lock{position:absolute;top:3px;right:4px;font-size:11px;padding:0 5px;border:1px solid #c2a25a;border-radius:3px;color:#d9b45a}
.olh .hz-slot.locked{flex-direction:column;justify-content:center;border-style:dashed;color:#c9b98f}
.olh .hz-slot.locked b{font-size:15px;color:#ece4d2}
.olh .hz-slot.locked .hz-buy{min-height:44px;padding:0 10px;border:1px solid #e0a070;border-radius:4px;background:linear-gradient(180deg,#c0482e,#8e2a1e)}
.olh .hz-slot.empty{justify-content:center;color:#8a7b5c}
.olh .hz-filters{flex:none;display:flex;gap:6px;overflow-x:auto;padding:2px 0}
.olh .hz-filters button{flex:none;min-height:44px;min-width:52px;padding:0 10px;border:1px solid #4a3f2c;border-radius:22px;background:#100d0a;display:flex;align-items:center;gap:4px}
.olh .hz-filters button[aria-pressed=true]{border-color:#d9b45a;background:#2e2414;color:#f3d68a}
.olh .ol-card .hz-cu{display:flex;align-items:center;gap:2px;font-size:12px;color:#f3d68a}
.olh .ol-card.boss{opacity:.4}
.olh .hz-ov{position:absolute;inset:0;background:#000b;display:flex;align-items:center;justify-content:center;padding:16px;z-index:5}
.olh .hz-ov:empty{display:none}
.olh .hz-box{width:min(440px,100%);background:#1d1710;border:1px solid #d9b45a;border-radius:6px;padding:12px 16px;display:flex;flex-direction:column;gap:8px}
.olh .hz-box h3{margin:0;font-size:17px;color:#d9b45a}.olh .hz-box p{margin:0;font-size:14px}
.olh .hz-box .hz-btns{display:flex;gap:8px;flex-wrap:wrap}.olh .hz-box .hz-btns button{flex:1;min-width:120px;min-height:44px;border:1px solid #8a7350;border-radius:4px;background:#0007}
.olh .hz-box .hz-btns button.go{border-color:#e0a070;background:linear-gradient(180deg,#c0482e,#8e2a1e)}
/* K600・K601 56：中央の3D（選んだ武将と後ろに主兵種の隊・指で回せる。toyo_reveal.js の mountHenseiCenter） */
.olh .hz-mid{flex:none;display:flex;gap:8px;align-items:stretch;min-height:0}
.olh .hz-stage{flex:none;width:200px;min-height:168px;border:1px solid #6a5a3a;border-radius:6px;background:#0d0a07;overflow:hidden;position:relative;touch-action:none}
.olh .hz-stage canvas{width:100%!important;height:100%!important;display:block}
.olh .hz-col{flex:1;min-width:0;display:flex;flex-direction:column}
@media (max-width:720px){.olh .hz-stage{display:none}}
@media (max-height:430px){.olh .hz-slot{min-height:120px}.olh .hz-slot .ol-face{width:42px;height:42px}.olh .ol-shelf{min-height:88px}}
@media (max-width:720px){.olh .hz-slots{grid-template-columns:repeat(3,minmax(0,1fr))}}
`;

// ---- 軍団の編成：onDone(o) で決めた手持ちを渡す ----
export function openHensei(o, onDone, onBack) {
  o = o || loadOnline(); if (!o) { onBack && onBack(); return null; }
  const el = root('軍団の編成');
  el.insertAdjacentHTML('beforeend', `<style>${CSS}</style>`);
  const boss = daimyoOf(o);
  let N = slotsOf(o);
  const army = (o.army || []).slice(0, N); while (army.length < N) army.push(null);
  // K602：大名本人は総大将の枠に固定（手持ちにいれば）
  const pinBoss = () => { if (!boss || !(o.owned || []).includes(boss)) return; const at = army.indexOf(boss); if (at > 0) army[at] = army[0]; army[0] = boss; };
  pinBoss();
  let sel = boss && army[0] === boss ? Math.max(1, army.indexOf(null)) : 0; if (sel < 0) sel = 1;
  const filt = new Set();
  el.insertAdjacentHTML('beforeend', `<div class="hz-top"><button type="button" class="ol-back" aria-label="戻る">‹</button><h2>軍団</h2>
      <div class="hz-stat" role="status"></div><button type="button" class="hz-auto">自動編成</button></div>
    <div class="hz-mid"><div class="hz-stage" aria-hidden="true"></div><div class="hz-col"><div class="hz-slots" role="group" aria-label="出陣武将"></div>
    <div class="hz-filters" role="group" aria-label="絞る">${FILTERS.map((f) => `<button type="button" data-f="${f}" aria-pressed="false">${['騎馬', '鉄砲', '槍', '弓'].includes(f) ? unitIcon({ 騎馬: 'kiba', 鉄砲: 'teppo', 槍: 'yari', 弓: 'yumi' }[f], 16) : ''}${f}</button>`).join('')}</div></div></div>
    <div class="ol-foot"><div class="ol-shelf" role="group" aria-label="手持ちの武将" style="flex:1;min-width:0"></div><button type="button" class="ol-go">この軍で決める</button></div>
    <div class="hz-ov"></div>`);
  const slots = el.querySelector('.hz-slots'), shelf = el.querySelector('.ol-shelf'), stat = el.querySelector('.hz-stat'), go = el.querySelector('.ol-go'), ov = el.querySelector('.hz-ov');
  const bump = () => { stat.animate?.([{ transform: 'translateX(-4px)' }, { transform: 'translateX(4px)' }, { transform: 'none' }], 300); navigator.vibrate?.(40); };
  const ask = (title, body, btns) => {
    ov.innerHTML = `<div class="hz-box" role="alertdialog" aria-label="${esc(title)}"><h3>${esc(title)}</h3>${body.map((t) => `<p>${esc(t)}</p>`).join('')}<div class="hz-btns">${btns.map(([l, , g], i) => `<button type="button" data-i="${i}" class="${g ? 'go' : ''}">${esc(l)}</button>`).join('')}</div></div>`;
    ov.querySelectorAll('[data-i]').forEach((b) => b.addEventListener('click', () => { const f = btns[+b.dataset.i][1]; ov.innerHTML = ''; f && f(); }));
    ov.querySelector('button')?.focus({ preventScroll: true });
  };
  // ---- 第五・第六の枠を小判で永久に開ける ----
  const kin = () => { const f = loadOnline(); if (f?.toyo) o.toyo = { ...(o.toyo || {}), ...f.toyo }; return kinOf(o); };
  const unlock = () => {
    const k = N + 1, price = SLOT_PRICE[k]; if (!price) return;
    const web = !canBuyKin();   // Web の版は無料で開けてよい（kaito 11/21）
    const have = kin();
    const name = `第${NUM[k - 1]}武将枠`;
    if (web) return ask(`${name}を永久解放します`, ['Web の版は無料で開けます'], [['解放', () => open(k), true], ['やめる', null]]);
    ask(`${name}を永久解放します`, [`必要 小判 ${n0(price)}`, `いまの小判 ${n0(have)}`], [['解放', () => {
      if (kin() < price) return short(price - kin());
      o.toyo = { ...(o.toyo || {}), kin: kin() - price };
      open(k);
    }, true], ['やめる', null]]);
  };
  const short = (need) => ask('小判が不足しています', [`あと ${n0(need)} 必要です`], [['小判を購入', async () => {
    try { const I = await import('./index.js'); if (I.openKinShop) return I.openKinShop(() => { if (el.isConnected) draw(); }); } catch (e) { /* 買い場がまだ無い */ }
  }, true], ['戻る', null]]);
  const open = (k) => { o.slots = k; N = k; army.push(null); sel = k - 1; saveOnline(o); draw(); };
  // ---- 自動編成：大名本人＋主兵種の合う者を Cost の内で ----
  const auto = (pref) => {
    const cap = capOf(N), pool = (o.owned || []).map(bushoOf).filter((b) => b && b.name !== boss);
    const rk = (b) => ['N', 'R', 'A', 'S', 'SS'].indexOf(b.rare);
    pool.sort((a, b) => (unitOf(b).id === pref) - (unitOf(a).id === pref) || rk(b) - rk(a));
    const next = Array(N).fill(null); let start = 0;
    if (boss && (o.owned || []).includes(boss)) { next[0] = boss; start = 1; }
    const minC = Math.min(...pool.map((b) => costOf(b.name)), 99);
    for (let i = start; i < N; i++) {
      const used = armyCost(next), left = N - i - 1;
      const b = pool.find((x) => !next.includes(x.name) && used + costOf(x.name) + left * minC <= cap);
      if (b) next[i] = b.name;
    }
    army.splice(0, army.length, ...next); sel = army.indexOf(null); if (sel < 0) sel = boss ? 1 : 0; draw();
  };
  // 中央の3D（k600-engi の toyo_reveal.js）。読めない時は箱を空けたまま進む
  let stage = null, stageOff = false;
  const stageEl = el.querySelector('.hz-stage');
  const stageSet = () => {
    const n = army[sel] || army.find(Boolean) || boss; if (!n || stageOff || !stageEl) return;
    if (stage) return stage.set(n);
    import('./toyo_reveal.js').then((T) => { if (stageOff || !el.isConnected || stage || !T.mountHenseiCenter) return; stage = T.mountHenseiCenter(stageEl, army[sel] || army.find(Boolean) || boss); }).catch(() => {});
  };
  const stageDispose = () => { stageOff = true; try { stage?.dispose(); } catch (e) { /* 片付けられなくても閉じる */ } stage = null; };
  const draw = () => {
    const cost = armyCost(army), cap = capOf(N), filled = army.filter(Boolean).length;
    stat.innerHTML = `<span>出陣武将<b>${filled}/${N}</b></span><span>総兵力<b>${n0(filled * TROOPS)}</b></span><span>武将Cost<b class="${cost > cap ? 'over' : ''}">${cost}/${cap}</b></span>`;
    slots.style.setProperty('--n', String(Math.min(SLOT_MAX, N + (N < SLOT_MAX ? 1 : 0))));
    slots.innerHTML = '';
    army.forEach((n, i) => {
      const b = n && bushoOf(n), u = b && unitOf(b), fixed = i === 0 && n && n === boss;
      const s = document.createElement('button'); s.type = 'button'; s.className = 'hz-slot' + (b ? '' : ' empty'); s.dataset.i = i;
      s.setAttribute('aria-pressed', String(i === sel));
      s.setAttribute('aria-label', lbl(ROLE[i], n || lw('空き'), u ? `${u.name} ${TROOPS}` : '', b ? `Cost ${costOf(n)}` : ''));
      s.innerHTML = b ? `${fixed ? '<span class="hz-lock">大名</span>' : ''}<div class="ol-face" style="--rc:${RARITY[b.rare].color}"></div>
        <div class="hz-info"><span class="hz-role">${esc(ROLE[i])}</span><span class="hz-nm"><i>${esc(n)}</i><span class="ol-rare" style="--rc:${RARITY[b.rare].color}">${b.rare}</span></span>
        <span class="hz-unit">${unitIcon(u.id, 16)}${esc(u.name)} ${n0(TROOPS)}</span><span>Cost ${costOf(n)}</span></div>`
        : `<span class="hz-role">${esc(ROLE[i])}</span><span style="font-size:24px;margin:auto">＋</span>`;
      if (b) face(s.querySelector('.ol-face'), n);
      s.addEventListener('click', () => {
        if (i === sel && n && !fixed) { army[i] = null; draw(); return; }   // 選んだ枠をもう一度押すと外す（大名本人は外せない）
        sel = i; draw();
      });
      slots.appendChild(s);
    });
    if (N < SLOT_MAX) {
      const k = N + 1, s = document.createElement('div'); s.className = 'hz-slot locked';
      s.innerHTML = `<b>＋ 第${NUM[k - 1]}陣</b><span>未解放</span><button type="button" class="hz-buy">${canBuyKin() ? '小判で解放' : '無料で解放'}</button>`;
      s.querySelector('.hz-buy').addEventListener('click', unlock);
      slots.appendChild(s);
    }
    shelf.innerHTML = '';
    for (const n of o.owned || []) {
      const b = bushoOf(n); if (!b) continue;
      const u = unitOf(b), kw = keywordsOf(b);
      if (filt.size && ![...filt].every((f) => kw.includes(f))) continue;
      const at0 = army.indexOf(n), try0 = army.slice(); if (at0 >= 0) try0[at0] = army[sel]; try0[sel] = n;
      const isBoss = n === boss && (o.owned || []).includes(boss);
      const fit = armyCost(try0) <= cap && !(sel === 0 && army[0] === boss && boss && n !== boss);
      const c = document.createElement('button'); c.type = 'button'; c.className = 'ol-card' + (army.includes(n) ? ' used' : '') + (fit ? '' : ' nofit') + (isBoss ? ' boss' : '');
      c.setAttribute('aria-label', lbl(n, b.rare, u.name, `Cost ${costOf(n)}`));
      c.innerHTML = `<div class="ol-face" style="--rc:${RARITY[b.rare].color}"></div><span class="ol-name">${esc(n)}</span><span class="hz-cu">${unitIcon(u.id, 13)}${esc(u.name)}<span class="ol-rare" style="--rc:${RARITY[b.rare].color};margin-left:3px">${b.rare}</span></span>`;
      face(c.querySelector('.ol-face'), n);
      c.addEventListener('click', () => {
        if (isBoss) return bump();   // 大名本人は総大将の枠から動かさない
        if (sel === 0 && army[0] === boss && boss) return bump();
        const at = army.indexOf(n);
        const next = army.slice(); if (at >= 0) next[at] = army[sel]; next[sel] = n;
        if (next[0] !== army[0] && army[0] === boss && boss) return bump();
        if (armyCost(next) > cap) { bump(); return; }
        army.splice(0, army.length, ...next); if (!o.kata[n]) o.kata[n] = b.fav;
        const empty = army.indexOf(null); if (empty >= 0) sel = empty; draw();
      });
      shelf.appendChild(c);
    }
    el.querySelectorAll('.hz-filters [data-f]').forEach((b) => b.setAttribute('aria-pressed', String(filt.has(b.dataset.f))));
    go.disabled = army.some((x) => !x) || cost > cap;
    stageSet();
  };
  o.kata = o.kata || {};
  el.querySelectorAll('.hz-filters [data-f]').forEach((b) => b.addEventListener('click', () => { const f = b.dataset.f; if (filt.has(f)) filt.delete(f); else filt.add(f); draw(); }));
  el.querySelector('.hz-auto').addEventListener('click', () => ask('自動編成', ['大名本人と、主兵種の合う武将を Cost の内で選びます'], [['騎馬中心', () => auto('kiba'), true], ['鉄砲中心', () => auto('teppo'), true], ['やめる', null]]));
  draw();
  go.addEventListener('click', () => { o.army = army.slice(); o.slots = N; saveOnline(o); stageDispose(); el.remove(); onDone && onDone(o); });
  el.querySelector('.ol-back').addEventListener('click', () => { stageDispose(); el.remove(); onBack && onBack(); });
  return el;
}
