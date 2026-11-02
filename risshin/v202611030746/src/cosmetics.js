// 見た目の品（kaito 11/1）：甲冑・前立・旗指物・馬の毛色。一つ100〜300円。強さは変えず見た目だけ。
// 武具屋の中の「特別な品」に並べ、買った物は城下（武具屋の姿見）と戦で着られる。
// 持っている品は paywall.js（OWNED_KEY）、着ている品はこの鍵に持つ。どちらも保存とは別（state.js の save/load/migrate には触らない）。
// Web と自動の道具は全部無料（paywall.allFree）。品の ID・名前・値段は docs/iap_1101.md と同じにする。
import { ownsProduct, buyProduct, canBuyInApp } from './paywall.js';

const P = 'jp.kaito.sengokurisshin.look_';
// slot：armor 具足の色・crest 兜の前立・flag 背の旗指物・horse 馬の毛色。同じ区分は一つだけ着る
export const COSMETICS = [
  { id: 'aka', slot: 'armor', name: '朱漆の具足（赤備え）', price: '300円', note: '胴も兜も朱の漆。遠くからも目立つ', look: { armor: 0x8e2416, lace: 0xb8342a, trim: 0xc9a24a, kbLac: 'shu' } },
  { id: 'kin', slot: 'armor', name: '金箔押の具足', price: '300円', note: '金の胴に紺の糸。大将らしい輝き', look: { armor: 0xa8823a, lace: 0x2e4468, trim: 0xe0bc5a, kbLac: 'kin' } },
  { id: 'kon', slot: 'armor', name: '黒漆に紺糸威の具足', price: '200円', note: '黒い漆に紺の糸。落ち着いた渋い色', look: { armor: 0x16120f, lace: 0x24305a, kbLac: 'kuro' } },
  { id: 'mika', slot: 'crest', name: '前立：三日月', price: '200円', note: '兜の前に金の三日月', look: { kbCrest: 'mika' } },
  { id: 'tentsuki', slot: 'crest', name: '前立：天衝', price: '200円', note: '兜の前に高い金の天衝', look: { kbCrest: 'tentsuki' } },
  { id: 'nichi', slot: 'crest', name: '前立：日輪', price: '200円', note: '兜の前に朱の日輪', look: { kbCrest: 'nichiR' } },
  { id: 'hata_shu', slot: 'flag', name: '旗指物：朱の旗', price: '100円', note: '背の旗を朱に', look: { flag: 'player_shu' } },
  { id: 'hata_shiro', slot: 'flag', name: '旗指物：白の旗', price: '100円', note: '背の旗を白に', look: { flag: 'player_shiro' } },
  { id: 'ashige', slot: 'horse', name: '馬の毛色：芦毛', price: '200円', note: '灰色に白の混じる毛の馬', kind: '芦毛' },
  { id: 'aoge', slot: 'horse', name: '馬の毛色：青毛', price: '200円', note: '黒くつやのある毛の馬', kind: '青毛' },
].map((c) => ({ ...c, pid: P + c.id }));
const BY = Object.fromEntries(COSMETICS.map((c) => [c.id, c]));
export const SLOT_NAME = { armor: '具足', crest: '前立', flag: '旗指物', horse: '馬' };

const WEAR_KEY = 'risshin_wear';
function wearing() { try { const o = JSON.parse(localStorage.getItem(WEAR_KEY) || '{}'); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; } }
function setWearing(o) { try { localStorage.setItem(WEAR_KEY, JSON.stringify(o)); } catch (e) {} }
export const owns = (id) => !!BY[id] && ownsProduct(BY[id].pid);
// 着ている品（持っていない物は着ない：返金や別の端末）
export function worn(slot) { const id = wearing()[slot]; return id && BY[id] && BY[id].slot === slot && owns(id) ? BY[id] : null; }
export function wear(id) { const c = BY[id]; if (!c || !owns(id)) return; setWearing({ ...wearing(), [c.slot]: id }); }
export function unwear(slot) { const o = wearing(); delete o[slot]; setWearing(o); }

// playerLook の終わりに重ねる（本人だけ）。前立は兜が要るので、陣笠の段でも前立を着たら兜にする
export function dressLook(look) {
  for (const slot of ['armor', 'crest', 'flag']) {
    const c = worn(slot);
    if (c) Object.assign(look, c.look);
  }
  if (worn('crest') && !String(look.hat).startsWith('kabuto')) { look.hat = 'kabuto'; look.real = 1; }
  if (worn('armor')) look.real = 1;
  return look;
}
// 本人の馬の毛色（着ていなければ null）
export const wornHorseKind = () => worn('horse')?.kind || null;

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
let busy = null;   // 買い物を待っている品の id
// 武具屋の下に並べる「特別な品」
export function specialShopHtml() {
  const app = canBuyInApp();
  return `<h3 class="tw-h" id="sp-shop" style="margin-top:16px">特別な品<small>見た目だけ。強さは変わらない</small></h3><div class="items">` + COSMETICS.map((c) => {
    const own = owns(c.id), on = worn(c.slot)?.id === c.id;
    let act;
    if (on) act = `<span class="note">着ている</span><button class="btn small" data-sp-off="${c.slot}">外す</button>`;
    else if (own) act = `<button class="btn small" data-sp-wear="${c.id}">着る</button>`;
    else if (!app) act = '<span class="note">この端末では買えない</span>';
    else if (busy === c.id) act = '<span class="note">購入の画面を開いています…</span>';
    else act = `<button class="btn small" data-sp-buy="${c.id}">${c.price}で買う</button>`;
    return `<div class="item ${on ? 'eq' : ''}"><div class="n">${esc(c.name)}<small>${SLOT_NAME[c.slot]}</small></div><div class="x">${esc(c.note)}</div><div class="a">${act}</div></div>`;
  }).join('') + '</div>';
}
// 押した後は rerender（武具屋を描き直す。姿見も着けた物で描き直る）
export function bindSpecialShop(rerender) {
  document.querySelectorAll('[data-sp-wear]').forEach((b) => b.onclick = () => { wear(b.dataset.spWear); rerender(); });
  document.querySelectorAll('[data-sp-off]').forEach((b) => b.onclick = () => { unwear(b.dataset.spOff); rerender(); });
  document.querySelectorAll('[data-sp-buy]').forEach((b) => b.onclick = async () => {
    const c = BY[b.dataset.spBuy];
    if (!c || busy) return;
    busy = c.id; rerender();
    const ok = await buyProduct(c.pid);
    busy = null;
    if (ok) wear(c.id);
    rerender();
  });
}
