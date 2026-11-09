// 見た目の品（kaito 11/1）：甲冑・前立・旗指物・馬の毛色。一つ100〜300円。強さは変えず見た目だけ。
// 武具屋の中の「特別な品」に並べ、買った物は城下（武具屋の姿見）と戦で着られる。
// 持っている品は paywall.js（OWNED_KEY）、着ている品はこの鍵に持つ。どちらも保存とは別（state.js の save/load/migrate には触らない）。
// Web と自動の道具は全部無料（paywall.allFree）。品の ID・名前・値段は docs/iap_1101.md と同じにする。
import { ownsProduct, buyProduct, canBuyInApp, canRestorePurchases, restorePurchases, confirmBuy } from './paywall.js';
import { ladderStep } from './state.js';

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
// 買う前の札で試しに着せる品（札を閉じたら外す）
let trying = null;
export function worn(slot) { if (trying && trying.slot === slot) return trying; const id = wearing()[slot]; return id && BY[id] && BY[id].slot === slot && owns(id) ? BY[id] : null; }
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
let restoreMsg = '';
// 武具屋の下に並べる「特別な品」
export function specialShopHtml() {
  const app = canBuyInApp();
  return `<h3 class="tw-h" id="sp-shop" style="margin-top:16px">特別な品<small>見た目だけ。強さは変わらない</small></h3>${app && canRestorePurchases() ? `<div class="row" style="gap:8px;align-items:center"><button class="btn small" id="sp-restore">購入を復元する</button><span class="note" role="status" aria-live="polite">${esc(restoreMsg)}</span></div>` : ''}<div class="items">` + COSMETICS.map((c) => {
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
// 確認札の中の姿：その品を着た本人（馬の毛色は馬に乗せて）。閉じる時に描く物を返す
export function lookOn(c, G) {
  return (cv) => {
    trying = c;
    return import('./preview.js').then(({ Preview }) => {
      if (!cv.isConnected) return () => {};
      const pv = new Preview(cv);
      if (!pv.renderer) { cv.remove(); return () => {}; }
      if (c.slot === 'horse') pv.setStep(G, Math.max(2, ladderStep(G)));
      else {
        pv.setLook(G);
        // 品の見える寄り：前立は兜の顔、具足は胴の全体（旗指物は旗の先まで入る元の引き）
        const cam = { crest: [1.8, 2.1, 1.72], armor: [1.25, 3.5, 1.05] }[c.slot];
        if (cam) { pv.holder.rotation.y = -0.45; pv.camera.position.set(0, cam[0], cam[1]); pv.camera.lookAt(0, cam[2], 0); }
        // 前立は顔の斜め前で止める（回すと兜の後ろが写る）
        if (c.slot === 'crest') pv.spin = 0;
      }
      return () => pv.dispose();
    }).finally(() => { trying = null; });
  };
}
// 押した後は rerender（武具屋を描き直す。姿見も着けた物で描き直る）。G があれば確認札に試しに着た姿を出す
export function bindSpecialShop(rerender, G) {
  document.querySelectorAll('[data-sp-wear]').forEach((b) => b.onclick = () => { wear(b.dataset.spWear); rerender(); });
  document.querySelectorAll('[data-sp-off]').forEach((b) => b.onclick = () => { unwear(b.dataset.spOff); rerender(); });
  document.querySelectorAll('[data-sp-buy]').forEach((b) => b.onclick = async () => {
    const c = BY[b.dataset.spBuy];
    if (!c || busy) return;
    const yes = await confirmBuy({
      title: `${esc(c.name)}（${c.price}）`, buy: `${c.price}で買う`,
      lines: [esc(c.note) + '。', '見た目だけで、強さは変わりません。買うと、城下と戦でいつでも着られます。'],
      look: G ? lookOn(c, G) : null,
    });
    if (!yes) return;
    busy = c.id; rerender();
    const ok = await buyProduct(c.pid);
    busy = null;
    if (ok) wear(c.id);
    rerender();
  });
  const rs = document.getElementById('sp-restore');
  if (rs) rs.onclick = async () => {
    if (rs.disabled) return;
    rs.disabled = true; restoreMsg = '購入を確かめています…'; rerender();
    try { await restorePurchases(); restoreMsg = COSMETICS.some((c) => owns(c.id)) ? '復元しました' : '復元できる購入はありません'; }
    catch (e) { restoreMsg = e.message; }
    rerender();
  };
}
