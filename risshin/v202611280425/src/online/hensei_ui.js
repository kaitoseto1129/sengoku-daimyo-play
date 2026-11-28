// 軍団の編成の画面。k365-cloud-48 が先に作り、cloud-24 へ渡し、11/21 K601 から iMac k598-tonya の受け持ち（docs/kaito_online_units_1121.md 20〜29・46〜48・56〜63）。
//   各枠＝顔の札・名・レア・主兵種・兵力（格で 600〜2000・K624⑤）・Cost。上に「出陣武将 4/4・総兵力・武将Cost 65/65」。
//   初めは4枠。第五陣 小判1,500・第六陣 小判3,000 で永久に開ける（最大6・サブスクでない・買ってすぐ使える。Web の版は無料で開ける）。Cost の上限は 4将 65・5将 80・6将 95。
//   K602：家の大名本人は総大将で、軍団から外せない。［騎馬］［鉄砲］［槍］［弓］［攻勢］［守備］［伏兵］で手持ちを絞る。［自動編成］騎馬中心・鉄砲中心。
//   枠を買えの札は登用の画面に出さない（ここで「第五陣 未解放」を見せるだけ）。
import { HOUSES, RARITY, ROSTER, bushoOf, costOf, armyCost, loadOnline, saveOnline, kinOf, face, root, esc, lbl, lw } from './house.js';
import { unitOf, keywordsOf, unitIcon, troopsOf } from './unit_type.js';
import { canBuyKin } from './kin_store.js';
import { openPresets } from './army_presets.js';   // K587 軍団の型（11/27 クラウド k365-cloud-05）
import { isEn, addEn } from '../i18n.js';
if (isEn()) import('./i18n_toyo.js').then((m) => addEn(m.default)).catch(() => {});   // K516：登城帳・軍団の編成の英訳

export const SLOT_MAX = 16;   // K627 ⑤（6→8）・K633 ③（8→10）・K642 ③（kaito 11/23「出陣を10→16人まで」）
export const SLOT_PRICE = { 5: 1500, 6: 3000, 7: 4500, 8: 6000, 9: 7500, 10: 9000, 11: 10500, 12: 12000, 13: 13500, 14: 15000, 15: 16500, 16: 18000 };
// K610（kaito）：総大将（家の大名本人・一番目の枠）の Cost は数えない。上限は家臣だけ（4将65・5将80・6将95）
export const vassalCost = (army) => armyCost((army || []).slice(1));
export const capOf = (n) => ({ 4: 65, 5: 80, 6: 95, 7: 110, 8: 125, 9: 140, 10: 155, 11: 170, 12: 185, 13: 200, 14: 215, 15: 230, 16: 245 }[n] || 65);
export const slotsOf = (o) => Math.max(4, Math.min(SLOT_MAX, o?.slots || 4));
export const daimyoOf = (o) => ROSTER.find((b) => b.house === o?.house && b.start && b.rare === 'SSR')?.name || null;
const ROLE = ['総大将', '左翼', '右翼', '後詰', '第五陣', '第六陣', '第七陣', '第八陣', '第九陣', '第十陣', '第十一陣', '第十二陣', '第十三陣', '第十四陣', '第十五陣', '第十六陣'];
const NUM = ['', '', '', '', '五', '六', '七', '八', '九', '十', '十一', '十二', '十三', '十四', '十五', '十六'];
// 兵種の色（印と色の両方で見分ける・原理5）。騎馬＝朱・鉄砲＝鉄の灰・槍＝藍・弓＝萌黄
const UCOL = { kiba: '#e8957a', teppo: '#cfc8ba', yari: '#94b6e8', yumi: '#a8d68e' };
// 枠の役の印（原理3）：本陣＝旗・後詰＝予備の輪
const ROLE_IC = { 本陣: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 22V3" stroke="currentColor" stroke-width="2.2"/><path d="M6 4h12l-3 4 3 4H6z" fill="currentColor"/></svg>', 後詰: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2.4" stroke-dasharray="4 3"/></svg>' };
const FILTERS = ['騎馬', '鉄砲', '槍', '弓'];   // K608 ⑬（長 11/21）：持っている武将を 全員・兵種・レア で絞る
const RARES = ['SSR', 'SR', 'R', 'N'];
// K624 ⑥：家で絞る（家の短い名。諸家＝other）
const HOUSE_F = [...HOUSES.map((h) => [h.id, h.name.replace('家', '')]), ['other', '諸家']];
// K607 既定の布陣：置き場（fujin_ui.js の枠と同じ名）・陣形（jinkei6.js の六つ）・布陣帳（fujin_ui.js の五つ）
const OPEN = { 4: ['左翼', '中央', '右翼'], 5: ['左翼', '左中', '中央', '右翼'], 6: ['左翼', '左中', '中央', '右中', '右翼'] };
OPEN[7] = OPEN[8] = OPEN[9] = OPEN[10] = OPEN[6];   // K638：七人より多い時も前の五列（前は表が六までで、七人以上だと四人の置き場しか選べなかった）
const PREF = ['左翼', '右翼', '後詰', '中央', '左中', '右中'];
export const JIN = ['横陣', '縦陣', '魚鱗', '鶴翼', '長蛇', '方円'];
export const BOOKS = ['標準', '攻勢', '守備', '騎馬', '鉄砲'];
const placesOf = (n) => [...(OPEN[Math.max(4, Math.min(16, n))] || OPEN[4]), '後詰'];
/** 既定の布陣（k592 の布陣・始まりの道が読む）：[{ name, slot: '本陣'|'左翼'|…, formation }] と布陣帳の名。無ければ null */
// K644 ②（kaito 11/23「決めた布陣が戦に反映されていない」）：前は枠の名（左翼など）と陣形だけを持ち、地図で置いた所は捨てて開戦で枠の点へ置き直していた。置いた所（pos・地図の真ん中が原点の m・自陣は −z）も持つ
const okPos = (p) => !!p && Number.isFinite(p.x) && Number.isFinite(p.z) && Math.abs(p.x) <= 200 && Math.abs(p.z) <= 150;
export function defaultFujinOf(o) {
  const d = o?.defaultFujin; if (!d?.pieces?.length) return null;
  const army = (o.army || []).filter(Boolean);
  const pieces = army.map((n, i) => { const q = d.pieces.find((x) => x.name === n); return { name: n, slot: i === 0 ? '本陣' : q?.slot || null, formation: JIN.includes(q?.formation) ? q.formation : '横陣', ...(okPos(q?.pos) ? { pos: { x: q.pos.x, z: q.pos.z } } : {}) }; });
  return { pieces, book: BOOKS.includes(d.book) ? d.book : '標準' };
}
const n0 = (v) => Number(v).toLocaleString('ja-JP');

const CSS = `
.olh .hz-top{display:flex;align-items:center;gap:10px;min-height:44px;flex:none;flex-wrap:wrap}
.olh .hz-stat{display:flex;gap:6px 14px;align-items:center;flex-wrap:wrap;margin-left:auto;font-size:14px;color:#c9b98f}
.olh .hz-stat b{font-size:17px;color:#ece4d2;font-variant-numeric:tabular-nums;margin-left:4px}
.olh .hz-stat b.over{color:#e3826a}
.olh .hz-auto,.olh .hz-clear,.olh .hz-preset{min-height:44px;min-width:44px;padding:0 12px;border:1px solid #c2a25a;border-radius:4px;background:#14120fcc}
.olh .hz-clear[hidden]{display:none}
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
.olh .hz-slots.many .hz-unit{font-size:12px;gap:2px}.olh .hz-slots.many .hz-info{font-size:12px}.olh .hz-slots.many .hz-unit svg,.olh .hz-slots.many .hz-unit canvas{width:11px;height:11px}
.olh .hz-slots.two{gap:4px;padding:3px 0}.olh .hz-slots.two .hz-slot{min-height:0;padding:19px 2px 2px;gap:0}.olh .hz-slots.two .hz-slot .ol-face{width:30px;height:30px}.olh .hz-slots.two .hz-role{top:2px;left:auto;right:3px;transform:none;font-size:12px;letter-spacing:0;max-width:calc(100% - 26px);flex-wrap:nowrap;overflow:hidden}.olh .hz-slots.two .hz-role svg,.olh .hz-slots.two .hz-jin{display:none}.olh .hz-slots.two .hz-rb{height:15px;line-height:15px;font-size:12px;min-width:18px;padding:0 3px}.olh .hz-slots.two .hz-nm i{font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block;max-width:100%}.olh .hz-slots.two .hz-nm{max-width:100%;overflow:hidden}.olh .hz-slots.two .hz-info{font-size:12px;line-height:1.15}.olh .hz-slots.two .hz-unit{font-size:12px}.olh .hz-slots.two .hz-unit svg,.olh .hz-slots.two .hz-unit canvas{width:10px;height:10px}.olh .hz-slots.two .hz-lock{top:19px;right:2px;font-size:12px;padding:0 2px}.olh .hz-slots.two .hz-slot.locked{font-size:12px;line-height:1.2}
.olh .hz-lock{position:absolute;top:3px;right:4px;font-size:12px;padding:0 5px;border:1px solid #c2a25a;border-radius:3px;color:#d9b45a}
.olh .hz-slot.locked{flex-direction:column;justify-content:center;border-style:dashed;color:#c9b98f}
.olh .hz-slot.locked b{font-size:15px;color:#ece4d2}
.olh .hz-slot.locked .hz-buy{min-height:44px;padding:0 10px;border:1px solid #e0a070;border-radius:4px;background:linear-gradient(180deg,#a83f28,#7c2519);color:#fff8ec}
.olh .hz-slot.empty{justify-content:center;color:#8a7b5c}
.olh .hz-gos{flex:none;display:flex;flex-direction:column;gap:6px}
.olh .hz-gos .ol-go{min-height:44px;padding:0 14px;font-size:15px;background:#14120fcc;border-color:#c2a25a}
.olh .hz-sortie{min-height:48px;padding:0 22px;border:1px solid #e0a070;border-radius:4px;background:linear-gradient(180deg,#c0482e,#8e2a1e);font-size:17px;letter-spacing:.2em;color:#fff3d4}
.olh .hz-sortie:disabled{opacity:.45}
.olh .hz-why{flex:none;min-height:20px;padding:2px 4px;font-size:13px;line-height:18px;color:#e9dcb8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.olh .hz-why.warn{color:#ffb4a4;font-weight:600}
.olh .hz-slot.locked .hz-key{display:inline-block;padding:0 5px;margin-right:3px;border:1px solid #c9a46a;border-radius:3px;font-size:12px;color:#ffd88a}
.olh .ol-card .hz-over{position:absolute;top:2px;right:2px;font-size:12px;padding:0 3px;border-radius:2px;background:#8a2a1f;color:#fff}
.olh .hz-filters{flex:none;display:flex;gap:6px;overflow-x:auto;padding:2px 0}
.olh .hz-filters.more-r{-webkit-mask-image:linear-gradient(90deg,#000 calc(100% - 36px),transparent);mask-image:linear-gradient(90deg,#000 calc(100% - 36px),transparent)}   /* 11/27 33：横へ流せる札の列は、続きのある側を薄くして分からせる（25 の英語の確かめ・831〜1481px が画面の外） */
.olh .hz-filters.more-l{-webkit-mask-image:linear-gradient(90deg,transparent,#000 36px);mask-image:linear-gradient(90deg,transparent,#000 36px)}
.olh .hz-filters.more-l.more-r{-webkit-mask-image:linear-gradient(90deg,transparent,#000 36px,#000 calc(100% - 36px),transparent);mask-image:linear-gradient(90deg,transparent,#000 36px,#000 calc(100% - 36px),transparent)}
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
.olh .hz-jin{font-size:12px;color:#a8987a;margin-left:4px}:lang(en) .olh .hz-role{letter-spacing:0;font-size:12.5px;flex-wrap:nowrap}:lang(en) .olh .hz-jin{font-size:12px;margin-left:3px}
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
  // K628 ②（kaito 11/22「家を選ぶと大名が外せない」）：大名も外せる。初めの軍団（保存が空の時）だけ大名を総大将に置く
  if (!army.some(Boolean)) pinBoss();
  let sel = boss && army[0] === boss ? Math.max(1, army.indexOf(null)) : 0; if (sel < 0) sel = 1;
  const filt = new Set(); let rareF = null, houseF = null;
  el.insertAdjacentHTML('beforeend', `<div class="hz-top"><button type="button" class="ol-back" aria-label="戻る">‹</button><h2>軍団</h2>
      <div class="hz-stat" role="status"></div><button type="button" class="hz-clear" hidden>全員を外す</button><button type="button" class="hz-preset" aria-label="軍団の型">型</button><button type="button" class="hz-auto">自動編成</button></div>
    <div class="hz-why" role="status" aria-live="polite"></div>
    <div class="hz-mid"><div class="hz-stage" aria-hidden="true"></div><div class="hz-col"><div class="hz-slots" role="group" aria-label="出陣武将"></div>
    <div class="hz-filters" role="group" aria-label="絞る"><button type="button" data-f="all" aria-pressed="true">全員</button>${FILTERS.map((f) => `<button type="button" data-f="${f}" aria-pressed="false">${['騎馬', '鉄砲', '槍', '弓'].includes(f) ? unitIcon({ 騎馬: 'kiba', 鉄砲: 'teppo', 槍: 'yari', 弓: 'yumi' }[f], 16) : ''}${f}</button>`).join('')}${RARES.map((r) => `<button type="button" data-r="${r}" aria-pressed="false" style="--rc:${RARITY[r]?.color || '#ccc'};color:var(--rc)">${r}</button>`).join('')}${HOUSE_F.map(([id, nm]) => `<button type="button" data-h="${id}" aria-pressed="false">${nm}</button>`).join('')}</div></div></div>
    <div class="ol-foot"><div class="hz-fp" role="group" aria-label="既定の布陣"></div><div class="ol-shelf" role="group" aria-label="手持ちの武将" style="flex:1;min-width:0"></div><div class="hz-gos"><button type="button" class="hz-sortie">出陣</button><button type="button" class="ol-go">この軍で決める</button></div></div>
    <div class="hz-map" aria-label="布陣の地図"></div>
    <div class="hz-ov"></div>`);
  const slots = el.querySelector('.hz-slots'), shelf = el.querySelector('.ol-shelf'), stat = el.querySelector('.hz-stat'), go = el.querySelector('.ol-go'), ov = el.querySelector('.hz-ov');
  const bump = () => { stat.animate?.([{ transform: 'translateX(-4px)' }, { transform: 'translateX(4px)' }, { transform: 'none' }], 300); navigator.vibrate?.(40); };
  // K638（kaito 11/22「編成を決めるのに色々な上限がある。6人しか連れて行けないとか、ボロボロ」）：足せない・決められない時は、その場で理由を一行で出す（揺らすだけにしない）
  const whyEl = el.querySelector('.hz-why'); let whyUntil = 0;
  const why = (t, warn = true) => { whyEl.textContent = t; whyEl.classList.toggle('warn', warn); whyUntil = performance.now() + 6000; bump(); };
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
    const rk = (b) => ['N', 'R', 'SR', 'SSR'].indexOf(b.rare);
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
  const fjPos = {};   // K644 ②：地図で置いた所（武将ごと）
  for (const q of o.defaultFujin?.pieces || []) { if (q.slot) fj.slot[q.name] = q.slot; if (JIN.includes(q.formation)) fj.jin[q.name] = q.formation; if (okPos(q.pos)) fjPos[q.name] = { x: q.pos.x, z: q.pos.z }; }
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
    // 33（11/21）の『i』を足し直す（18・11/27）：選んだ武将の札（能力・兵種・固有戦術。final 120）。枠は釦なので中に入れず、横の欄の頭に置く
    if (n) {
      const ib = document.createElement('button'); ib.type = 'button'; ib.className = 'hz-card'; ib.textContent = 'i'; ib.setAttribute('aria-label', lbl(n, lw('能力と固有戦術')));
      ib.style.cssText = 'width:44px;height:44px;margin:0 0 8px;border-radius:50%;border:1px solid #8a7350;background:#0009;color:#e8c77a;font:italic 700 18px/1 serif;cursor:pointer';
      ib.addEventListener('click', (e) => { e.stopPropagation(); import('./busho_card.js').then((m) => m.openBushoCard(n)).catch(() => {}); });
      fp.prepend(ib);
    }
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
    const def = list.map((n, i) => ({ name: n, slot: i === 0 ? '本陣' : fj.slot[n] || null, formation: fj.jin[n] || '横陣', ...(fjPos[n] ? { pos: fjPos[n] } : {}) }));
    let initial = F.placeDefault ? F.placeDefault(def, 'heigen', heishuName) : null;
    if (prev && initial) initial = initial.map((q) => { const p = prev.find((x) => x.name === q.name && x.slot && x.slot !== '…'); return p ? { ...q, slot: p.slot, pos: p.pos, formation: p.formation || q.formation } : q; });
    fmap = F.mountFujin(mapEl, { generals: list, mapId: 'heigen', map: { w: 400, h: 300 }, initial, usePrev: false, countdown: false, embed: true, onDone: () => {},
      onChange: (st) => { if (gen !== fmapGen) return; readMapFrom(st.generals); drawCards(); autoSave(); } });   // K644 ①：動かした度に保存（［軍勢を決める］を押さなくても）   // c23f5ae8b2：置いた・陣形を替えた度に上の札の置き場と陣形を替える
    fitMap();
  };
  // 地図の高さ：画面の残りに合わせる（パソコンは一画面に収める・携帯の横は 330px 以上で下へ送って見る）
  const fitMap = () => { if (!mapEl.isConnected) { removeEventListener('resize', fitMap); return; } const t = mapEl.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop; mapEl.style.height = (el.clientHeight < 520 ? el.clientHeight - 12 : Math.max(330, Math.min(620, el.clientHeight - t - 12))) + 'px'; };   // 携帯の横は下へ送ると地図が画面いっぱい（K616）
  addEventListener('resize', fitMap);
  const readMapFrom = (st) => { for (const g of st || []) { if (!g?.name) continue; if (g.slot && g.slot !== '…' && g.slot !== '本陣') fj.slot[g.name] = g.slot; if (JIN.includes(g.formation)) fj.jin[g.name] = g.formation; if (g.slot && g.slot !== '…' && okPos(g.pos)) fjPos[g.name] = { x: g.pos.x, z: g.pos.z }; }
  };
  const readMap = () => readMapFrom(mapState());
  const drawCards = () => draw();
  const draw = () => {
    if (army.filter(Boolean).length === 1 && !army[0]) { const i = army.findIndex(Boolean); army[0] = army[i]; army[i] = null; if (sel === 0 || sel === i) sel = army.indexOf(null) > 0 ? army.indexOf(null) : 1; }   // K706：一人だけなら総大将に置く
    fixPlaces();
    const cost = vassalCost(army), cap = capOf(N), filled = army.filter(Boolean).length;
    stat.innerHTML = `<span>出陣武将<b>${filled}/${N}</b></span><span>総兵力<b>${n0(army.reduce((a, n) => a + (n ? troopsOf(bushoOf(n)) : 0), 0))}</b></span><span class="hz-cost">Cost<i class="hz-cbar${cost > cap ? ' over' : ''}" aria-hidden="true"><b style="width:${Math.min(100, cost / cap * 100)}%"></b></i>残り<b class="${cost > cap ? 'over' : ''}">${cap - cost}</b></span>`;
    { const owned = (o.owned || []).filter((n) => bushoOf(n)).length;
      if (performance.now() > whyUntil) {
        const warn = cost > cap || !filled;
        // K516（11/27 cloud-25）：英語の時は出陣の条件の一行を英語で組む（字の表は一つの形しか無く、空き・鍵・手持ちの組み合わせで日本語のまま出た）
        whyEl.textContent = isEn() ? (cost > cap ? `Cost is ${cost - cap} over the cap (cap ${cap} for ${N} generals; the commander is not counted). Swap in a lower-Cost general, or unlock a slot to raise the cap.`
          : !filled ? 'Place at least one general to deploy.'
          : [`You can deploy ${filled} general${filled === 1 ? '' : 's'}`, filled < N ? `${N - filled} empty slot${N - filled === 1 ? '' : 's'}` : '', N < SLOT_MAX ? `${SLOT_MAX - N} more slot${SLOT_MAX - N === 1 ? ' is' : 's are'} locked (unlock from Slot ${N + 1} · up to ${SLOT_MAX})` : `Up to ${SLOT_MAX}`, owned < N ? `${owned} owned (recruit for more)` : ''].filter(Boolean).join(' · '))
          : cost > cap ? `Cost が上限を ${cost - cap} 越えています（${N}人の上限 ${cap}・総大将は数えない）。Cost の低い武将に替えるか、枠を開けると上限が上がります`
          : !filled ? '武将を一人以上置くと出陣できます'
          : [`${filled}人で出陣できます`, filled < N ? `空き ${N - filled} 枠` : '', N < SLOT_MAX ? `あと ${SLOT_MAX - N} 枠は鍵（第${NUM[N]}陣から順に開ける・最大 ${SLOT_MAX} 人）` : `最大 ${SLOT_MAX} 人`, owned < N ? `手持ち ${owned} 人（登用で増える）` : ''].filter(Boolean).join('・');
        whyEl.classList.toggle('warn', warn);
      } }
    { const cols = Math.min(SLOT_MAX, N + (N < SLOT_MAX ? (N + 1 < SLOT_MAX ? 2 : 1) : 0)), two = cols > 10;   // K642 ③：十一より多い時は二段（一段八つまで）に小さな札で並べる
      slots.style.setProperty('--n', String(two ? Math.ceil(cols / 2) : cols)); slots.classList.toggle('two', two); }
    slots.classList.toggle('many', N >= 8);   // K633 ③：八枠より多い時は、兵種と兵力・Cost の字を小さく（十枠で枠からはみ出た）
    slots.innerHTML = '';
    army.forEach((n, i) => {
      const b = n && bushoOf(n), u = b && unitOf(b), fixed = false;   // K628 ②：大名も外せる（総大将の枠の印『大名』だけは残す）
      const lordMark = i === 0 && n && n === boss;
      const s = document.createElement('button'); s.type = 'button'; s.className = 'hz-slot' + (b ? '' : ' empty'); s.dataset.i = i;
      s.setAttribute('aria-pressed', String(i === sel));
      s.setAttribute('aria-label', lbl(ROLE[i], n || lw('空き'), u ? `${u.name} ${troopsOf(b)}` : '', b ? `Cost ${costOf(n)}` : ''));
      s.innerHTML = b ? `${lordMark ? '<span class="hz-lock">大名</span>' : ''}<div class="ol-face" style="--rc:${RARITY[b.rare].color}"></div>
        <span class="hz-rb" style="--rc:${RARITY[b.rare].color}">${b.rare}</span><div class="hz-info"><span class="hz-role">${(() => { const r = i === 0 ? '本陣' : fj.slot[n] || ROLE[i]; return (ROLE_IC[r] || '') + esc(r); })()}<span class="hz-jin">${esc(fj.jin[n] || '横陣')}</span></span><span class="hz-nm"><i>${esc(n)}</i></span>
        <span class="hz-unit" style="--uc:${UCOL[u.id] || '#f3d68a'}">${unitIcon(u.id, 16)}${esc(u.name)} ${n0(troopsOf(b))}</span><span>${i === 0 ? 'Cost 数えない' : `Cost ${costOf(n)}`}</span></div>`
        : `<span class="hz-role">${esc(ROLE[i])}</span><span style="font-size:24px;margin:auto">＋</span>`;
      if (b) face(s.querySelector('.ol-face'), n);
      // 上の札から地図へ引いて置く（k592 の api.dragFrom。引かずに離せば今まで通り枠を選ぶ）
      if (n) { s.style.touchAction = 'none'; s.addEventListener('pointerdown', (e) => { if (e.button === 0 && fmap?.dragFrom) fmap.dragFrom(n, e); }); }
      s.addEventListener('click', () => {
        if (i === sel && n && !fixed && mode !== 'fujin') { army[i] = null; if (i === 0) sel = 0; draw(); return; }   // 選んだ枠をもう一度押すと外す（K628 ②：大名・総大将も外せる。総大将を外したら、その枠を選んだまま＝下の札か上の枠の誰かを総大将に選ぶ）
        sel = i; draw();
      });
      slots.appendChild(s);
    });
    if (N < SLOT_MAX) {
      const k = N + 1, s = document.createElement('div'); s.className = 'hz-slot locked';
      s.innerHTML = `<b><span class="hz-key">鍵</span>第${NUM[k - 1]}陣</b><span>${canBuyKin() ? `小判 ${n0(SLOT_PRICE[k] || 0)} で開く` : 'Web の版は無料で開く'}</span><span style="font-size:12px">開くと Cost 上限 ${capOf(k)}</span><button type="button" class="hz-buy">${canBuyKin() ? '小判で解放' : '無料で解放'}</button>`;
      s.querySelector('.hz-buy').addEventListener('click', unlock);
      slots.appendChild(s);
      // K638：その先の鍵の枠も一つにまとめて見せる（何人まで連れて行けるか・順に開く）
      if (k < SLOT_MAX) { const r = document.createElement('div'); r.className = 'hz-slot locked'; r.setAttribute('aria-label', `第${NUM[k]}陣から第${NUM[SLOT_MAX - 1]}陣は鍵。順に開く`); r.innerHTML = `<b><span class="hz-key">鍵</span>第${NUM[k]}〜${NUM[SLOT_MAX - 1]}陣</b><span>前の枠を開けると順に開ける</span><span style="font-size:12px">最大 ${SLOT_MAX} 人</span>`; slots.appendChild(r); }
    }
    shelf.innerHTML = '';
    for (const n of o.owned || []) {
      const b = bushoOf(n); if (!b) continue;
      const u = unitOf(b), kw = keywordsOf(b);
      if (filt.size && ![...filt].every((f) => kw.includes(f))) continue;
      if (rareF && b.rare !== rareF) continue;
      if (houseF && b.house !== houseF) continue;
      const at0 = army.indexOf(n), try0 = army.slice(); if (at0 >= 0) try0[at0] = army[sel]; try0[sel] = n;
      const isBoss = false;   // K628 ②：大名も他の武将と同じに動かせる
      const fit = vassalCost(try0) <= cap;
      const c = document.createElement('button'); c.type = 'button'; c.className = 'ol-card' + (army.includes(n) ? ' used' : '') + (fit ? '' : ' nofit') + (isBoss ? ' boss' : '');
      c.setAttribute('aria-label', lbl(n, b.rare, u.name, `Cost ${costOf(n)}`, fit ? '' : 'Cost の上限を越えるので入れられない'));
      c.innerHTML = `<div class="ol-face" style="--rc:${RARITY[b.rare].color}"></div><span class="ol-name">${esc(n)}</span><span class="hz-cu" style="color:${UCOL[u.id] || '#f3d68a'}">${unitIcon(u.id, 13)}${esc(u.name)}<span class="ol-rare" style="--rc:${RARITY[b.rare].color};margin-left:3px">${b.rare}</span></span>`;
      face(c.querySelector('.ol-face'), n);
      if (army.includes(n)) { c.style.position = 'relative'; c.insertAdjacentHTML('beforeend', '<span class="hz-in" style="position:absolute;top:2px;right:2px;font-size:12px;padding:0 4px;border-radius:3px;background:#d9b45a;color:#1b1408;opacity:1">出陣中</span>'); }   // K706：置いた人も絞りに並べて印を付ける
      if (!fit) { c.style.position = 'relative'; c.insertAdjacentHTML('beforeend', '<span class="hz-over">Cost超</span>'); }
      c.addEventListener('click', () => {
        const at = army.indexOf(n);
        const next = army.slice(); if (at >= 0) next[at] = army[sel]; next[sel] = n;
        if (vassalCost(next) > cap) { why(`${n}を${sel === 0 ? '総大将' : '第' + (NUM[sel] || sel + 1) + 'の枠'}に入れると Cost ${vassalCost(next)}/${cap} で上限を越えます。Cost の低い者に替えるか、枠を開けて上限を上げる`); return; }
        army.splice(0, army.length, ...next); if (!o.kata[n]) o.kata[n] = b.fav;
        const empty = army.indexOf(null); if (empty >= 0) sel = empty; draw();
      });
      shelf.appendChild(c);
    }
    el.querySelectorAll('.hz-filters [data-f]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.f === 'all' ? !filt.size && !rareF && !houseF : filt.has(b.dataset.f))));
    el.querySelectorAll('.hz-filters [data-r]').forEach((b) => b.setAttribute('aria-pressed', String(rareF === b.dataset.r)));
    el.querySelectorAll('.hz-filters [data-h]').forEach((b) => b.setAttribute('aria-pressed', String(houseF === b.dataset.h)));
    { const ab = el.querySelector('.hz-filters [data-f="all"]'); if (ab) ab.textContent = `全員 ${(o.owned || []).filter((n) => bushoOf(n)).length}`; }
    { const cb = el.querySelector('.hz-clear'); if (cb) cb.hidden = !filled; }   // K646：出陣が一人以上の時だけ［全員を外す］
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
  import('./roster_filter.js').then((RF) => { if (el.isConnected) RF.attachHensei(el); }).catch(() => {});   // K587 お気に入りの星で絞る（cloud-25・roster_filter.js）
  { const fr = el.querySelector('.hz-filters'); const edge = () => { if (!fr) return; const x = fr.scrollLeft, w = fr.scrollWidth - fr.clientWidth; fr.classList.toggle('more-l', x > 4); fr.classList.toggle('more-r', x < w - 4); };   // 続きの有る側を薄く
    fr?.addEventListener('scroll', edge, { passive: true }); addEventListener('resize', edge); requestAnimationFrame(edge); }
  // K646（kaito 11/24「何人かいる時に全員解除のボタンを付けて、一気に布陣から外せるように」）：確かめの札の後、出陣の枠を全部空ける（保存も空に）。外した武将は手持ちに残る
  el.querySelector('.hz-clear').addEventListener('click', () => ask('全員を外す', [isEn() ? `Remove all ${army.filter(Boolean).length} generals from the deploy slots. They stay in your roster.` : `出陣の枠から ${army.filter(Boolean).length} 人を全員外します。武将は手持ちに残ります`], [['全員を外す', () => { army.fill(null); sel = 0; fmapKey = ''; o.army = army.slice(); o.defaultFujin = null; saveOnline(o); draw(); }, true], ['やめる', null]]));
  // K587 軍団の型（11/27 クラウド k365-cloud-05）：今の軍団を五つの枠に残す・ひと押しで呼び出す。持っていない・Cost を越える者は外して顔に印で見せる（army_presets.js）
  el.querySelector('.hz-preset').addEventListener('click', () => openPresets(el, o, {
    N: () => N, capOf, vcost: vassalCost,
    getState: () => { readMap(); fixPlaces(); return { army: army.slice(), slots: N, defaultFujin: packFujin() }; },
    onApply: (fit) => {
      army.splice(0, army.length, ...fit.army);
      for (const k of Object.keys(fj.slot)) delete fj.slot[k]; for (const k of Object.keys(fj.jin)) delete fj.jin[k]; for (const k of Object.keys(fjPos)) delete fjPos[k];
      for (const q of fit.fujin?.pieces || []) { if (q.slot && q.slot !== '本陣') fj.slot[q.name] = q.slot; if (JIN.includes(q.formation)) fj.jin[q.name] = q.formation; if (okPos(q.pos)) fjPos[q.name] = { x: q.pos.x, z: q.pos.z }; }
      if (BOOKS.includes(fit.fujin?.book)) fj.book = fit.fujin.book;
      for (const [n, k] of Object.entries(fit.kata || {})) o.kata[n] = k;
      sel = army.indexOf(null); if (sel < 0) sel = army.length > 1 ? 1 : 0;
      draw(); autoSave();
    },
  }));
  el.querySelector('.hz-auto').addEventListener('click', () => ask('自動編成', ['大名本人と、主兵種の合う武将を Cost の内で選びます'], [['騎馬中心', () => auto('kiba'), true], ['鉄砲中心', () => auto('teppo'), true], ['やめる', null]]));
  draw();
  const packFujin = () => ({ book: fj.book, pieces: army.filter(Boolean).map((n, i) => ({ name: n, slot: i === 0 ? '本陣' : fj.slot[n], formation: fj.jin[n] || '横陣', ...(fjPos[n] ? { pos: { ...fjPos[n] } } : {}) })) });
  // K644 ①：地図で駒を動かした・陣形を替えた時は、その場で軍勢と布陣を保存する（Cost の上限の内で、一人以上いる時だけ。総大将の枠が空なら保存しない）
  const autoSave = () => { try { if (!army[0] || vassalCost(army) > capOf(N)) return; fixPlaces(); o.army = army.slice(); o.slots = N; o.defaultFujin = packFujin(); saveOnline(o); } catch (e) { /* 保存できなくても布陣は続ける */ } };
  const commit = (then) => { if (!army[0]) { const k = army.findIndex(Boolean); if (k > 0) { army[0] = army[k]; army[k] = null; } }   // K628 ②：総大将の枠が空なら、残りの先頭の者を総大将に
    readMap(); fixPlaces(); o.army = army.slice(); o.slots = N; o.defaultFujin = packFujin(); saveOnline(o); try { window.risshinMetrics?.corpsSave?.({ n: N }); } catch (e) {} stageDispose(); fmapGen++; try { fmap?.destroy?.(); } catch (e) { /* 片付け済み */ } el.remove(); then(o); };
  go.addEventListener('click', () => commit((x) => onDone && onDone(x)));
  // K624 ⑫：軍団の画面から直に出陣（決めて保存してから［対戦］の選び＝諸大名・オンライン）
  const sortie = el.querySelector('.hz-sortie');
  sortie.addEventListener('click', () => commit(() => import('./index.js').then((I) => I.openTaisen(window.__game, onBack || (() => {}))).catch(() => onDone && onDone(o))));
  el.querySelector('.ol-back').addEventListener('click', () => { stageDispose(); fmapGen++; try { fmap?.destroy?.(); } catch (e) { /* 片付け済み */ } el.remove(); onBack && onBack(); });
  return el;
}
