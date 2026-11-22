// 軍団の編成の画面。k365-cloud-48 が先に作り、cloud-24 へ渡し、11/21 K601 から iMac k598-tonya の受け持ち（docs/kaito_online_units_1121.md 20〜29・46〜48・56〜63）。
//   各枠＝顔の札・名・レア・主兵種・兵力（格で 600〜2000・K624⑤）・Cost。上に「出陣武将 4/4・総兵力・武将Cost 65/65」。
//   初めは4枠。第五陣 小判1,500・第六陣 小判3,000 で永久に開ける（最大6・サブスクでない・買ってすぐ使える。Web の版は無料で開ける）。Cost の上限は 4将 65・5将 80・6将 95。
//   K602：家の大名本人は総大将で、軍団から外せない。［騎馬］［鉄砲］［槍］［弓］［攻勢］［守備］［伏兵］で手持ちを絞る。［自動編成］騎馬中心・鉄砲中心。
//   枠を買えの札は登用の画面に出さない（ここで「第五陣 未解放」を見せるだけ）。
import { HOUSES, RARITY, ROSTER, bushoOf, costOf, armyCost, loadOnline, saveOnline, kinOf, face, root, esc, lbl, lw } from './house.js';
import { unitOf, keywordsOf, unitIcon, troopsOf } from './unit_type.js';
import { canBuyKin } from './kin_store.js';

export const SLOT_MAX = 8;   // K627 ⑤（kaito 11/22「出陣枠を6→8に」）
export const SLOT_PRICE = { 5: 1500, 6: 3000, 7: 4500, 8: 6000 };
// K610（kaito）：総大将（家の大名本人・一番目の枠）の Cost は数えない。上限は家臣だけ（4将65・5将80・6将95）
export const vassalCost = (army) => armyCost((army || []).slice(1));
export const capOf = (n) => ({ 4: 65, 5: 80, 6: 95, 7: 110, 8: 125 }[n] || 65);
export const slotsOf = (o) => Math.max(4, Math.min(SLOT_MAX, o?.slots || 4));
export const daimyoOf = (o) => ROSTER.find((b) => b.house === o?.house && b.start && b.rare === 'SS')?.name || null;
const ROLE = ['総大将', '左翼', '右翼', '後詰', '第五陣', '第六陣', '第七陣', '第八陣'];
const NUM = ['', '', '', '', '五', '六', '七', '八'];
// 兵種の色（印と色の両方で見分ける・原理5）。騎馬＝朱・鉄砲＝鉄の灰・槍＝藍・弓＝萌黄
const UCOL = { kiba: '#e8957a', teppo: '#cfc8ba', yari: '#94b6e8', yumi: '#a8d68e' };
// 枠の役の印（原理3）：本陣＝旗・後詰＝予備の輪
const ROLE_IC = { 本陣: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 22V3" stroke="currentColor" stroke-width="2.2"/><path d="M6 4h12l-3 4 3 4H6z" fill="currentColor"/></svg>', 後詰: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2.4" stroke-dasharray="4 3"/></svg>' };
const FILTERS = ['騎馬', '鉄砲', '槍', '弓'];   // K608 ⑬（長 11/21）：持っている武将を 全員・兵種・レア で絞る
const RARES = ['SS', 'S', 'A', 'R', 'N'];
// K624 ⑥：家で絞る（家の短い名。諸家＝other）
const HOUSE_F = [...HOUSES.map((h) => [h.id, h.name.replace('家', '')]), ['other', '諸家']];
// K607 既定の布陣：置き場（fujin_ui.js の枠と同じ名）・陣形（jinkei6.js の六つ）・布陣帳（fujin_ui.js の五つ）
const OPEN = { 4: ['左翼', '中央', '右翼'], 5: ['左翼', '左中', '中央', '右翼'], 6: ['左翼', '左中', '中央', '右中', '右翼'] };
const PREF = ['左翼', '右翼', '後詰', '中央', '左中', '右中'];
export const JIN = ['横陣', '縦陣', '魚鱗', '鶴翼', '長蛇', '方円'];
export const BOOKS = ['標準', '攻勢', '守備', '騎馬', '鉄砲'];
const placesOf = (n) => [...(OPEN[Math.max(4, Math.min(8, n))] || OPEN[4]), '後詰'];
/** 既定の布陣（k592 の布陣・始まりの道が読む）：[{ name, slot: '本陣'|'左翼'|…, formation }] と布陣帳の名。無ければ null */
export function defaultFujinOf(o) {
  const d = o?.defaultFujin; if (!d?.pieces?.length) return null;
  const army = (o.army || []).filter(Boolean);
  const pieces = army.map((n, i) => { const q = d.pieces.find((x) => x.name === n); return { name: n, slot: i === 0 ? '本陣' : q?.slot || null, formation: JIN.includes(q?.formation) ? q.formation : '横陣' }; });
  return { pieces, book: BOOKS.includes(d.book) ? d.book : '標準' };
}
const n0 = (v) => Number(v).toLocaleString('ja-JP');

const CSS = `
.olh .hz-top{display:flex;align-items:center;gap:10px;min-height:44px;flex:none;flex-wrap:wrap}
.olh .hz-stat{display:flex;gap:6px 14px;align-items:center;flex-wrap:wrap;margin-left:auto;font-size:14px;color:#c9b98f}
.olh .hz-stat b{font-size:17px;color:#ece4d2;font-variant-numeric:tabular-nums;margin-left:4px}
.olh .hz-stat b.over{color:#e3826a}
.olh .hz-auto{min-height:44px;padding:0 12px;border:1px solid #c2a25a;border-radius:4px;background:#14120fcc}
.olh .hz-slots{flex:none;display:grid;grid-template-columns:repeat(var(--n),minmax(0,1fr));gap:8px;padding:6px 0}
.olh .hz-slot{position:relative;display:flex;flex-direction:column;gap:2px;align-items:center;justify-content:flex-start;border:1px solid #6a5a3a;border-radius:6px;background:#17130ecc;padding:38px 4px 4px;min-height:142px;min-width:0;text-align:center}
.olh .hz-slot[aria-pressed=true]{border:2px solid #d9b45a;background:#241b12}
.olh .hz-slot .ol-face{width:52px;height:52px;flex:none}
.olh .hz-info{display:flex;flex-direction:column;align-items:center;gap:1px;min-width:0;max-width:100%;font-size:12.5px;color:#c9b98f}
.olh .hz-role{position:absolute;top:17px;left:50%;transform:translateX(-50%);font-size:14px;font-weight:700;letter-spacing:.1em;color:#f3d68a;white-space:nowrap;display:flex;flex-wrap:wrap;justify-content:center;align-items:center;gap:0 3px;max-width:100%;line-height:1.1}
.olh .hz-role svg{width:13px;height:13px;flex:none}
/* K616（docs/ui_refs_sengoku.md 原理10・5）：格は左上の帯・名は下・兵種と Cost はその下。兵種は印と色の両方で */
.olh .hz-rb{position:absolute;top:0;left:0;min-width:24px;height:18px;padding:0 5px;border-radius:5px 0 6px 0;background:var(--rc);color:#14120f;font-size:12px;font-weight:800;line-height:18px;text-align:center}
.olh .hz-cost{display:flex;align-items:center;gap:6px}
.olh .hz-cbar{position:relative;display:inline-block;width:84px;height:8px;border:1px solid #8a7350;border-radius:4px;background:#0008;overflow:hidden}
.olh .hz-cbar b{position:absolute;inset:0;right:auto;background:#d9b45a;margin:0}
.olh .hz-cbar.over b{background:#c0482e}
.olh .hz-nm{font-size:14px;color:#ece4d2;line-height:1.25;display:flex;gap:4px;align-items:center;max-width:100%;white-space:normal}.olh .hz-nm i{font-style:normal;white-space:normal;overflow-wrap:anywhere;text-align:center;line-height:1.1;font-size:13px}
.olh .hz-unit{white-space:nowrap;display:flex;align-items:center;gap:4px;color:var(--uc,#f3d68a);font-size:14px;font-weight:600}
.olh .hz-lock{position:absolute;top:3px;right:4px;font-size:11px;padding:0 5px;border:1px solid #c2a25a;border-radius:3px;color:#d9b45a}
.olh .hz-slot.locked{flex-direction:column;justify-content:center;border-style:dashed;color:#c9b98f}
.olh .hz-slot.locked b{font-size:15px;color:#ece4d2}
.olh .hz-slot.locked .hz-buy{min-height:44px;padding:0 10px;border:1px solid #e0a070;border-radius:4px;background:linear-gradient(180deg,#c0482e,#8e2a1e)}
.olh .hz-slot.empty{justify-content:center;color:#8a7b5c}
.olh .hz-gos{flex:none;display:flex;flex-direction:column;gap:6px}
.olh .hz-gos .ol-go{min-height:44px;padding:0 14px;font-size:15px;background:#14120fcc;border-color:#c2a25a}
.olh .hz-sortie{min-height:48px;padding:0 22px;border:1px solid #e0a070;border-radius:4px;background:linear-gradient(180deg,#c0482e,#8e2a1e);font-size:17px;letter-spacing:.2em;color:#fff3d4}
.olh .hz-sortie:disabled{opacity:.45}
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
.olh .hz-map{flex:none;height:clamp(330px,calc(100vh - 420px),560px);margin-top:8px;border:1px solid #6a5a3a;border-radius:6px;overflow:hidden;position:relative}
.olh .hz-map .fujin-go{display:none}
.olh .hz-mode{min-height:44px;padding:0 12px;border:1px solid #c2a25a;border-radius:4px;background:#14120fcc}
.olh .hz-mode[aria-pressed=true]{background:#2e2414;color:#f3d68a;border-color:#d9b45a}
.olh .hz-fp{flex:1;min-width:0;display:none;flex-direction:column;gap:3px;padding:2px 0}
.olh.fj .hz-fp{display:flex}.olh.fj .hz-filters,.olh.fj .ol-shelf{display:none}
.olh .hz-fr{display:flex;gap:6px;align-items:center;overflow-x:auto}
.olh .hz-fr>span{flex:none;font-size:12.5px;color:#c9b98f;min-width:3.4em}
.olh .hz-fr button{flex:none;min-height:44px;min-width:48px;padding:0 9px;border:1px solid #4a3f2c;border-radius:4px;background:#100d0a}
.olh .hz-fr button[aria-pressed=true]{border-color:#d9b45a;background:#2e2414;color:#f3d68a}
.olh .hz-fr button:disabled{opacity:.4}
.olh .hz-fr .hz-rec{border-color:#c2a25a}
.olh .hz-jin{font-size:11.5px;color:#a8987a;margin-left:4px}:lang(en) .olh .hz-role{letter-spacing:0;font-size:12.5px;flex-wrap:nowrap}:lang(en) .olh .hz-jin{font-size:10px;margin-left:3px}
@media (max-height:430px){.olh .hz-slot{min-height:136px;padding-top:36px}.olh .hz-slot .ol-face{width:42px;height:42px}.olh .ol-shelf{min-height:88px}}
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
  const filt = new Set(); let rareF = null, houseF = null;
  el.insertAdjacentHTML('beforeend', `<div class="hz-top"><button type="button" class="ol-back" aria-label="戻る">‹</button><h2>軍団</h2>
      <div class="hz-stat" role="status"></div><button type="button" class="hz-auto">自動編成</button></div>
    <div class="hz-mid"><div class="hz-stage" aria-hidden="true"></div><div class="hz-col"><div class="hz-slots" role="group" aria-label="出陣武将"></div>
    <div class="hz-filters" role="group" aria-label="絞る"><button type="button" data-f="all" aria-pressed="true">全員</button>${FILTERS.map((f) => `<button type="button" data-f="${f}" aria-pressed="false">${['騎馬', '鉄砲', '槍', '弓'].includes(f) ? unitIcon({ 騎馬: 'kiba', 鉄砲: 'teppo', 槍: 'yari', 弓: 'yumi' }[f], 16) : ''}${f}</button>`).join('')}${RARES.map((r) => `<button type="button" data-r="${r}" aria-pressed="false" style="--rc:${RARITY[r]?.color || '#ccc'};color:var(--rc)">${r}</button>`).join('')}${HOUSE_F.map(([id, nm]) => `<button type="button" data-h="${id}" aria-pressed="false">${nm}</button>`).join('')}</div></div></div>
    <div class="ol-foot"><div class="hz-fp" role="group" aria-label="既定の布陣"></div><div class="ol-shelf" role="group" aria-label="手持ちの武将" style="flex:1;min-width:0"></div><div class="hz-gos"><button type="button" class="hz-sortie">出陣</button><button type="button" class="ol-go">この軍で決める</button></div></div>
    <div class="hz-map" aria-label="布陣の地図"></div>
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
      const used = vassalCost(next), left = N - i - 1;
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
  // ---- K607 既定の布陣：置き場と陣形（武将ごと）・布陣帳の既定 ----
  const fj = { slot: {}, jin: {}, book: BOOKS.includes(o.defaultFujin?.book) ? o.defaultFujin.book : '標準' };
  for (const q of o.defaultFujin?.pieces || []) { if (q.slot) fj.slot[q.name] = q.slot; if (JIN.includes(q.formation)) fj.jin[q.name] = q.formation; }
  let mode = 'busho';
  const fixPlaces = () => {   // 総大将は本陣。ほかは置き場を一人一つ（開いている枠と後詰）
    const P = placesOf(N), used = new Set();
    army.forEach((n, i) => { if (!n || i === 0) return; const sl = fj.slot[n]; if (P.includes(sl) && !used.has(sl)) used.add(sl); else delete fj.slot[n]; });
    army.forEach((n, i) => { if (!n || i === 0 || fj.slot[n]) return; const f = PREF.find((x) => P.includes(x) && !used.has(x)) || P.find((x) => !used.has(x)) || '後詰'; fj.slot[n] = f; used.add(f); });
  };
  const fp = el.querySelector('.hz-fp');
  const drawFp = () => {
    const n = army[sel], P = placesOf(N), boss0 = sel === 0;
    const row = (label, items, cur, attr, dis) => `<div class="hz-fr"><span>${esc(label)}</span>${items.map((x) => `<button type="button" data-${attr}="${esc(x)}" aria-pressed="${x === cur}"${dis ? ' disabled' : ''}>${esc(x)}</button>`).join('')}</div>`;
    fp.innerHTML = (n ? row('置き場', boss0 ? ['本陣'] : P, boss0 ? '本陣' : fj.slot[n], 'pl', boss0) + row('陣形', JIN, fj.jin[n] || '横陣', 'jn', false) : '<div class="hz-fr"><span>武将を選ぶ</span></div>')
      + `<div class="hz-fr"><span>布陣帳</span>${BOOKS.map((x) => `<button type="button" data-bk="${esc(x)}" aria-pressed="${x === fj.book}">${esc(x)}</button>`).join('')}<button type="button" class="hz-rec">おすすめ</button></div>`;
    fp.querySelectorAll('[data-pl]').forEach((b) => b.addEventListener('click', () => {
      const want = b.dataset.pl, other = army.find((x, j) => x && j > 0 && x !== n && fj.slot[x] === want);
      if (other) fj.slot[other] = fj.slot[n]; fj.slot[n] = want; draw();
    }));
    fp.querySelectorAll('[data-jn]').forEach((b) => b.addEventListener('click', () => { if (n) { fj.jin[n] = b.dataset.jn; draw(); } }));
    fp.querySelectorAll('[data-bk]').forEach((b) => b.addEventListener('click', () => { fj.book = b.dataset.bk; draw(); }));
    fp.querySelector('.hz-rec').addEventListener('click', async () => {   // 兵種と地形から（fujin_ui.js の recommendLayout・平原で）
      try {
        const F = await import('./fujin_ui.js'); const list = army.filter(Boolean);
        const out = F.recommendLayout(list.map((x) => ({ name: x, heishu: unitOf(bushoOf(x)).name, pos: { x: 0, z: 0 } })), 'heigen');
        out.forEach((q, i) => { if (i > 0 && q.slot) fj.slot[q.name] = q.slot; });
        const kinds = list.map((x) => unitOf(bushoOf(x)).id);
        fj.book = kinds.filter((k) => k === 'kiba').length >= 2 ? '騎馬' : kinds.filter((k) => k === 'teppo').length >= 2 ? '鉄砲' : '標準';
      } catch (e) { /* 読めない時は今のまま */ }
      draw();
    });
  };
  el.querySelector('.hz-mode')?.addEventListener('click', () => { mode = mode === 'busho' ? 'fujin' : 'busho'; el.classList.toggle('fj', mode === 'fujin'); el.querySelector('.hz-mode').setAttribute('aria-pressed', String(mode === 'fujin')); draw(); });
  // ---- K607・kaito 11/22：軍団の下に布陣の地図を常に出す（k592 の fujin_ui.js の mountFujin をそのまま）。地図で置いた置き場と陣形が既定の布陣 ----
  const mapEl = el.querySelector('.hz-map');
  el.style.overflowY = 'auto';   // 携帯の横では地図は下へ送って見る
  let fmap = null, fmapKey = '', fmapGen = 0, F = null;
  const heishuName = (n) => unitOf(bushoOf(n)).name;
  const mapState = () => { try { return fmap?.state?.().generals || null; } catch (e) { return null; } };
  const remountMap = async () => {
    const list = army.filter(Boolean), key = list.join('|');
    if (key === fmapKey && fmap) return;
    const prev = mapState(), gen = ++fmapGen;
    fmapKey = key;
    try { F = F || await import('./fujin_ui.js'); } catch (e) { return; }
    if (gen !== fmapGen || !el.isConnected) return;
    try { fmap?.destroy?.(); } catch (e) { /* 片付け済み */ }
    fmap = null; mapEl.innerHTML = '';
    if (!list.length || !F.mountFujin) return;
    // 始めの置き場：今の地図の置き場（同じ者）→ 保存した既定（placeDefault で平原の枠へ）
    const def = list.map((n, i) => ({ name: n, slot: i === 0 ? '本陣' : fj.slot[n] || null, formation: fj.jin[n] || '横陣' }));
    let initial = F.placeDefault ? F.placeDefault(def, 'heigen', heishuName) : null;
    if (prev && initial) initial = initial.map((q) => { const p = prev.find((x) => x.name === q.name && x.slot && x.slot !== '…'); return p ? { ...q, slot: p.slot, pos: p.pos, formation: p.formation || q.formation } : q; });
    fmap = F.mountFujin(mapEl, { generals: list, mapId: 'heigen', map: { w: 400, h: 300 }, initial, usePrev: false, countdown: false, embed: true, onDone: () => {},
      onChange: (st) => { if (gen !== fmapGen) return; readMapFrom(st.generals); drawCards(); } });   // c23f5ae8b2：置いた・陣形を替えた度に上の札の置き場と陣形を替える
    fitMap();
  };
  // 地図の高さ：画面の残りに合わせる（パソコンは一画面に収める・携帯の横は 330px 以上で下へ送って見る）
  const fitMap = () => { if (!mapEl.isConnected) { removeEventListener('resize', fitMap); return; } const t = mapEl.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop; mapEl.style.height = (el.clientHeight < 520 ? el.clientHeight - 12 : Math.max(330, Math.min(620, el.clientHeight - t - 12))) + 'px'; };   // 携帯の横は下へ送ると地図が画面いっぱい（K616）
  addEventListener('resize', fitMap);
  const readMapFrom = (st) => { for (const g of st || []) { if (!g?.name) continue; if (g.slot && g.slot !== '…' && g.slot !== '本陣') fj.slot[g.name] = g.slot; if (JIN.includes(g.formation)) fj.jin[g.name] = g.formation; }
  };
  const readMap = () => readMapFrom(mapState());
  const drawCards = () => draw();
  const draw = () => {
    fixPlaces();
    const cost = vassalCost(army), cap = capOf(N), filled = army.filter(Boolean).length;
    stat.innerHTML = `<span>出陣武将<b>${filled}/${N}</b></span><span>総兵力<b>${n0(army.reduce((a, n) => a + (n ? troopsOf(bushoOf(n)) : 0), 0))}</b></span><span class="hz-cost">Cost<i class="hz-cbar${cost > cap ? ' over' : ''}" aria-hidden="true"><b style="width:${Math.min(100, cost / cap * 100)}%"></b></i>残り<b class="${cost > cap ? 'over' : ''}">${cap - cost}</b></span>`;
    slots.style.setProperty('--n', String(Math.min(SLOT_MAX, N + (N < SLOT_MAX ? 1 : 0))));
    slots.innerHTML = '';
    army.forEach((n, i) => {
      const b = n && bushoOf(n), u = b && unitOf(b), fixed = i === 0 && n && n === boss;
      const s = document.createElement('button'); s.type = 'button'; s.className = 'hz-slot' + (b ? '' : ' empty'); s.dataset.i = i;
      s.setAttribute('aria-pressed', String(i === sel));
      s.setAttribute('aria-label', lbl(ROLE[i], n || lw('空き'), u ? `${u.name} ${troopsOf(b)}` : '', b ? `Cost ${costOf(n)}` : ''));
      s.innerHTML = b ? `${fixed ? '<span class="hz-lock">大名</span>' : ''}<div class="ol-face" style="--rc:${RARITY[b.rare].color}"></div>
        <span class="hz-rb" style="--rc:${RARITY[b.rare].color}">${b.rare}</span><div class="hz-info"><span class="hz-role">${(() => { const r = i === 0 ? '本陣' : fj.slot[n] || ROLE[i]; return (ROLE_IC[r] || '') + esc(r); })()}<span class="hz-jin">${esc(fj.jin[n] || '横陣')}</span></span><span class="hz-nm"><i>${esc(n)}</i></span>
        <span class="hz-unit" style="--uc:${UCOL[u.id] || '#f3d68a'}">${unitIcon(u.id, 16)}${esc(u.name)} ${n0(troopsOf(b))}</span><span>${i === 0 ? 'Cost 数えない' : `Cost ${costOf(n)}`}</span></div>`
        : `<span class="hz-role">${esc(ROLE[i])}</span><span style="font-size:24px;margin:auto">＋</span>`;
      if (b) face(s.querySelector('.ol-face'), n);
      // 上の札から地図へ引いて置く（k592 の api.dragFrom。引かずに離せば今まで通り枠を選ぶ）
      if (n) { s.style.touchAction = 'none'; s.addEventListener('pointerdown', (e) => { if (e.button === 0 && fmap?.dragFrom) fmap.dragFrom(n, e); }); }
      s.addEventListener('click', () => {
        if (i === sel && n && !fixed && mode !== 'fujin') { army[i] = null; draw(); return; }   // 選んだ枠をもう一度押すと外す（大名本人は外せない）
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
      if (rareF && b.rare !== rareF) continue;
      if (houseF && b.house !== houseF) continue;
      const at0 = army.indexOf(n), try0 = army.slice(); if (at0 >= 0) try0[at0] = army[sel]; try0[sel] = n;
      const isBoss = n === boss && (o.owned || []).includes(boss);
      const fit = vassalCost(try0) <= cap && !(sel === 0 && army[0] === boss && boss && n !== boss);
      const c = document.createElement('button'); c.type = 'button'; c.className = 'ol-card' + (army.includes(n) ? ' used' : '') + (fit ? '' : ' nofit') + (isBoss ? ' boss' : '');
      c.setAttribute('aria-label', lbl(n, b.rare, u.name, `Cost ${costOf(n)}`));
      c.innerHTML = `<div class="ol-face" style="--rc:${RARITY[b.rare].color}"></div><span class="ol-name">${esc(n)}</span><span class="hz-cu" style="color:${UCOL[u.id] || '#f3d68a'}">${unitIcon(u.id, 13)}${esc(u.name)}<span class="ol-rare" style="--rc:${RARITY[b.rare].color};margin-left:3px">${b.rare}</span></span>`;
      face(c.querySelector('.ol-face'), n);
      c.addEventListener('click', () => {
        if (isBoss) return bump();   // 大名本人は総大将の枠から動かさない
        if (sel === 0 && army[0] === boss && boss) return bump();
        const at = army.indexOf(n);
        const next = army.slice(); if (at >= 0) next[at] = army[sel]; next[sel] = n;
        if (next[0] !== army[0] && army[0] === boss && boss) return bump();
        if (vassalCost(next) > cap) { bump(); return; }
        army.splice(0, army.length, ...next); if (!o.kata[n]) o.kata[n] = b.fav;
        const empty = army.indexOf(null); if (empty >= 0) sel = empty; draw();
      });
      shelf.appendChild(c);
    }
    el.querySelectorAll('.hz-filters [data-f]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.f === 'all' ? !filt.size && !rareF && !houseF : filt.has(b.dataset.f))));
    el.querySelectorAll('.hz-filters [data-r]').forEach((b) => b.setAttribute('aria-pressed', String(rareF === b.dataset.r)));
    el.querySelectorAll('.hz-filters [data-h]').forEach((b) => b.setAttribute('aria-pressed', String(houseF === b.dataset.h)));
    { const ab = el.querySelector('.hz-filters [data-f="all"]'); if (ab) ab.textContent = `全員 ${(o.owned || []).filter((n) => bushoOf(n)).length}`; }
    go.disabled = !filled || cost > cap;
    { const sb = el.querySelector('.hz-sortie'); if (sb) sb.disabled = go.disabled; }   // K610：枠を全部埋めなくても決められる（出陣は置いた人数で）
    stageSet();
    fitMap();
    remountMap();
    if (mode === 'fujin') drawFp();
  };
  o.kata = o.kata || {};
  el.querySelectorAll('.hz-filters [data-f]').forEach((b) => b.addEventListener('click', () => { const f = b.dataset.f; if (f === 'all') { filt.clear(); rareF = null; houseF = null; } else if (filt.has(f)) filt.delete(f); else { filt.clear(); filt.add(f); } draw(); }));
  el.querySelectorAll('.hz-filters [data-r]').forEach((b) => b.addEventListener('click', () => { rareF = rareF === b.dataset.r ? null : b.dataset.r; draw(); }));
  el.querySelectorAll('.hz-filters [data-h]').forEach((b) => b.addEventListener('click', () => { houseF = houseF === b.dataset.h ? null : b.dataset.h; draw(); }));
  el.querySelector('.hz-auto').addEventListener('click', () => ask('自動編成', ['大名本人と、主兵種の合う武将を Cost の内で選びます'], [['騎馬中心', () => auto('kiba'), true], ['鉄砲中心', () => auto('teppo'), true], ['やめる', null]]));
  draw();
  const commit = (then) => { readMap(); fixPlaces(); o.army = army.slice(); o.slots = N; o.defaultFujin = { book: fj.book, pieces: army.filter(Boolean).map((n, i) => ({ name: n, slot: i === 0 ? '本陣' : fj.slot[n], formation: fj.jin[n] || '横陣' })) }; saveOnline(o); stageDispose(); fmapGen++; try { fmap?.destroy?.(); } catch (e) { /* 片付け済み */ } el.remove(); then(o); };
  go.addEventListener('click', () => commit((x) => onDone && onDone(x)));
  // K624 ⑫：軍団の画面から直に出陣（決めて保存してから［対戦］の選び＝諸大名・オンライン）
  const sortie = el.querySelector('.hz-sortie');
  sortie.addEventListener('click', () => commit(() => import('./index.js').then((I) => I.openTaisen(window.__game, onBack || (() => {}))).catch(() => onDone && onDone(o))));
  el.querySelector('.ol-back').addEventListener('click', () => { stageDispose(); fmapGen++; try { fmap?.destroy?.(); } catch (e) { /* 片付け済み */ } el.remove(); onBack && onBack(); });
  return el;
}
