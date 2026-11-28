// オンライン（K580・K585）の家と手持ち（k365-cloud-48。docs/online_plan_1121.md の受け持ち：online/house.js・online/home_ui.js）。
// ここは表と保存と、画面の共通の部品（家紋・顔・兵種の型の絵・札の地・CSS）。画面は home_ui.js（ホーム・家を選ぶ・手持ちの一覧）と hensei_ui.js（編成・cloud-24 の物）。
// 紙：docs/online_final_1120.md の 3〜26・119〜120。
// 字は少なく、絵で分からせる：家は家紋の大きな札、武将は顔、レアは色と縁の形、コストは升の数の棒、兵種の型は小さな絵。
// 手持ちと軍団はこの端末に置く（state.js の保存には触らない）。サーバーの所有の管理が来たら load/save を差し替える。
// 武将の表は bushou_online.js（27）が元。どの家も初めの4人でコスト上限65に収まるようにした。
import { drawMon } from '../textures.js';

import { BUSHOU_ONLINE, COST, MERGED_ID, MERGED_NAME } from './bushou_online.js';
import { newBank, grant } from './busho_bank.js';
import { isEn, tr, addEn } from '../i18n.js';
// 英語の時だけ、模擬合戦で出る共通の札の英訳を足す（online/i18n_match48.js）
if (isEn()) import('./i18n_match48.js').then((m) => addEn(m.default)).catch(() => {});

export const COST_CAP = 65;
// レアの色（字だけに頼らず色と縁で見分ける）。コストは 27 の表（bushou_online.js の COST）の一つだけ
const RC = { N: '#8c8a84', R: '#4f7fb8', SR: '#d1624c', SSR: '#d9b45a' };
export const RARITY = Object.fromEntries(Object.keys(COST).map((r) => [r, { cost: COST[r], color: RC[r] }]));
// 兵種の型（紙の 70：標準・槍重視・鉄砲重視・騎馬重視・守備重視）。名は読み上げ用、画面は絵だけ。
export const KATA = [
  { id: 'std', name: '標準' }, { id: 'yari', name: '槍重視' }, { id: 'teppo', name: '鉄砲重視' },
  { id: 'kiba', name: '騎馬重視' }, { id: 'shubi', name: '守備重視' },
];
// 役（総大将・左翼・右翼・後詰）。総大将に本陣の印。
export const ROLES = [{ id: 'taisho', name: '総大将' }, { id: 'left', name: '左翼' }, { id: 'right', name: '右翼' }, { id: 'reserve', name: '後詰' }];

// 武将：27 の表（bushou_online.js・一つだけの元）から読む。start＝家を選ぶと無料の初めの4人。id は登用（27）と手持ちの帳（33）が使う。
//   得意の兵種の型は表に fav があればそれ、無ければこの係の小さな表（どちらにも無い人は標準）
const FAV = {
  織田信長: 'teppo', 柴田勝家: 'yari', 前田利家: 'yari', 木下藤吉郎: 'std', 滝川一益: 'teppo', 丹羽長秀: 'shubi', 明智光秀: 'teppo',
  武田信玄: 'kiba', 山県昌景: 'kiba', 馬場信春: 'shubi', 内藤昌豊: 'yari', 武田勝頼: 'kiba',
  上杉謙信: 'kiba', 柿崎景家: 'kiba', 斎藤朝信: 'yari', 甘粕景持: 'shubi', 直江兼続: 'shubi',
  徳川家康: 'shubi', 本多忠勝: 'yari', 榊原康政: 'yari', 酒井忠次: 'teppo', 井伊直政: 'kiba',
  毛利元就: 'std', 吉川元春: 'yari', 小早川隆景: 'shubi', 毛利隆元: 'std',
  島津義久: 'std', 島津家久: 'teppo', 島津義弘: 'yari', 島津歳久: 'teppo',
  真田信繁: 'teppo', 黒田官兵衛: 'shubi', 伊達政宗: 'kiba', 長宗我部信親: 'yari', 豊臣秀吉: 'std',
};
export const ROSTER = BUSHOU_ONLINE.map((b) => ({ id: b.id, name: b.name, house: b.house, rare: b.rank, start: !!b.start, fav: b.fav || FAV[b.name] || 'std' }));
export const HOUSES = [
  { id: 'oda', name: '織田家', mon: 'oda', color: '#cdac50' },
  { id: 'takeda', name: '武田家', mon: 'takeda', color: '#b72f21' },
  { id: 'uesugi', name: '上杉家', mon: 'uesugi', color: '#e8e2d2' },
  { id: 'tokugawa', name: '徳川家', mon: 'tokugawa', color: '#3a3a38' },
  { id: 'mori', name: '毛利家', mon: 'mori', color: '#3a3834' },
  { id: 'shimazu', name: '島津家', mon: 'shimazu', color: '#5e5a4e' },
];
export const bushoOf = (name) => ROSTER.find((b) => b.name === name) || null;
export const costOf = (name) => RARITY[bushoOf(name)?.rare]?.cost || 0;
export const armyCost = (army) => army.reduce((s, n) => s + (n ? costOf(n) : 0), 0);
export const startersOf = (house) => ROSTER.filter((b) => b.house === house && b.start).map((b) => b.name);

// ---- この端末の手持ち（state.js の保存とは別の鍵） ----
const KEY = 'risshin_online_v1';
// 一つの箱（index.js の決め②）：o = { house, owned:[名], army:[4], kata:{名:型}, bank（33 の手持ちの帳）, toyo（27 の登用の数） }。
//   登用・交換所は bank に足す。owned（名の並び）は bank から作り直す（二つがずれないように）
const byId = (id) => ROSTER.find((b) => b.id === id);
function addOwned(o, name) {
  const b = bushoOf(name); if (!b) return;
  o.bank = o.bank || newBank();
  if (!o.bank.owned[b.id]) grant(o.bank, { id: b.id, rarity: b.rare });
  if (!o.owned.includes(name)) o.owned.push(name);
  if (!o.kata[name]) o.kata[name] = b.fav;
}
// K642（11/23）：同じ人の二行を一人にまとめた（MERGED_NAME・MERGED_ID）。保存の中の名と id を残る方へ寄せる（重なれば一人に）
function mergeSame(o) {
  const nm = (x) => MERGED_NAME[x] || x, uniq = (a) => [...new Set(a.map(nm))];
  if (Array.isArray(o.owned)) o.owned = uniq(o.owned);
  if (Array.isArray(o.army)) o.army = o.army.map((x) => (typeof x === 'string' ? nm(x) : x)).filter((x, i, a) => x == null || typeof x !== 'string' || a.indexOf(x) === i);
  if (o.kata) for (const [a, b] of Object.entries(MERGED_NAME)) if (a in o.kata) { if (!(b in o.kata)) o.kata[b] = o.kata[a]; delete o.kata[a]; }
  for (const box of [o.bank?.owned, o.toyo?.owned]) if (box) for (const [a, b] of Object.entries(MERGED_ID)) if (a in box) { box[b] = Math.max(box[b] || 0, box[a] || 0) || box[a]; delete box[a]; }
  return o;
}
export function syncOwned(o) {
  if (!o) return o;
  o.owned = o.owned || []; o.kata = o.kata || {};
  mergeSame(o);
  if (!o.bank) { o.bank = newBank(); for (const n of o.owned.slice()) addOwned(o, n); }
  for (const id of Object.keys(o.bank.owned)) { const b = byId(id); if (b && o.bank.owned[id] > 0) { if (!o.owned.includes(b.name)) o.owned.push(b.name); if (!o.kata[b.name]) o.kata[b.name] = b.fav; } }
  return o;
}
export function loadOnline() {
  try { const o = JSON.parse(localStorage.getItem(KEY) || 'null'); if (o && o.house) return syncOwned(o); } catch (e) { /* 読めない時は新しく */ }
  return null;
}
export function saveOnline(o) {
  try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) { /* 保存できない端末でも画面は進める */ }
  // 保存した時に知らせる（ホームの金の字をその場で替える。買い物の流れ〔33〕は保存するだけでよい）
  try { window.dispatchEvent(new CustomEvent('risshin-online-saved', { detail: o })); } catch (e) { /* 古い端末 */ }
}
export const kinOf = (o) => Math.max(0, Math.floor(o?.toyo?.kin || 0));   // 金は登用の数の箱（27 の toyo state の kin）に一つだけ
// 家を替える（1シーズンに1回は無料。紙の 12）。手持ちは残し、新しい家の4人を足す
export function changeHouse(o, house) {
  syncOwned(o); for (const n of startersOf(house)) addOwned(o, n);
  if (o.house !== house) { o.house = house; o.houseChanges = (o.houseChanges || 0) + 1; }
  return o;
}
export function newOnline(house) {
  const four = startersOf(house);
  const o = { house, owned: [], army: four.slice(0, 4), kata: {}, houseChanges: 0, bank: newBank() };
  for (const n of four) addOwned(o, n);
  return o;
}

// 読み上げの名（aria-label）を部品ごとに訳してつなぐ。英語の時は一つずつ英語にして『, 』で（つないだ字は表に無いので日本語が残った）
export const lbl = (...parts) => { const p = parts.filter((x) => x !== '' && x != null).map(String); return isEn() ? p.map((x) => tr(x)).join(', ') : p.join('・'); };
const LW = { 軍団: 'In army', 空き: 'Empty', 重さ: 'Cost' };
export const lw = (j) => (isEn() ? LW[j] || tr(j) : j);
// ---- 絵 ----
export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export function monCanvas(kind, w, h) {
  const c = document.createElement('canvas'); c.width = w * 2; c.height = h * 2; c.style.width = `${w}px`; c.style.height = `${h}px`;
  try { drawMon(c.getContext('2d'), kind, c.width, c.height); } catch (e) { /* 紋の無い家は地の色だけ */ }
  return c;
}
// 兵種の型の小さな絵（字を使わない）
export function drawKata(g, id, s, ink = '#ece4d2') {
  g.clearRect(0, 0, s, s); g.strokeStyle = ink; g.fillStyle = ink; g.lineWidth = s * 0.07; g.lineCap = 'round';
  const L = (a, b, c, d) => { g.beginPath(); g.moveTo(a * s, b * s); g.lineTo(c * s, d * s); g.stroke(); };
  if (id === 'yari') { L(.2, .85, .78, .2); g.beginPath(); g.moveTo(.86 * s, .1 * s); g.lineTo(.7 * s, .2 * s); g.lineTo(.8 * s, .3 * s); g.closePath(); g.fill(); }
  else if (id === 'teppo') { L(.12, .55, .85, .4); L(.12, .55, .12, .72); g.fillRect(.12 * s, .55 * s, .22 * s, .16 * s); g.beginPath(); g.arc(.9 * s, .38 * s, .05 * s, 0, 6.3); g.fill(); }
  else if (id === 'kiba') { g.beginPath(); g.moveTo(.2 * s, .85 * s); g.lineTo(.32 * s, .45 * s); g.quadraticCurveTo(.45 * s, .15 * s, .7 * s, .18 * s); g.lineTo(.85 * s, .35 * s); g.lineTo(.62 * s, .38 * s); g.lineTo(.55 * s, .85 * s); g.closePath(); g.fill(); }
  else if (id === 'shubi') { g.beginPath(); g.moveTo(.5 * s, .12 * s); g.lineTo(.84 * s, .26 * s); g.quadraticCurveTo(.82 * s, .7 * s, .5 * s, .9 * s); g.quadraticCurveTo(.18 * s, .7 * s, .16 * s, .26 * s); g.closePath(); g.stroke(); }
  else { for (const [x, y] of [[.3, .35], [.7, .35], [.5, .7]]) { g.beginPath(); g.arc(x * s, y * s, .12 * s, 0, 6.3); g.fill(); } }
}
export function kataCanvas(id, s) { const c = document.createElement('canvas'); c.width = s * 2; c.height = s * 2; c.style.width = `${s}px`; c.style.height = `${s}px`; drawKata(c.getContext('2d'), id, s * 2); return c; }
// 顔：3D で撮った絵（busho_portrait.js・重いので後から）。撮れるまでは家紋
// 11/21 K586（cloud-38）：撮れるまではその人の家紋（bushou_card_art.js・戦の中と同じ表）、撮れたら顔の右下にその人の旗印を小さく添える
export function face(el, name) {
  const b = bushoOf(name); if (!b) return;
  el.style.position = el.style.position || 'relative';
  const mc = document.createElement('canvas'); mc.width = mc.height = 80; mc.style.cssText = 'width:40px;height:40px';
  el.appendChild(mc);
  const art = import('../bushou_card_art.js');
  art.then((A) => { if (!A.drawCardMon(mc, name, '#ece4d2')) { mc.remove(); el.appendChild(monCanvas(HOUSES.find((h) => h.id === b.house)?.mon || b.house, 40, 40)); } }).catch(() => {});
  import('../busho_portrait.js').then((m) => m.portrait(name)).then((url) => {
    if (!url || !el.isConnected) return; el.innerHTML = ''; const im = new Image(); im.src = url; im.alt = ''; el.appendChild(im);
    art.then((A) => {
      const fc = document.createElement('canvas'); fc.width = 40; fc.height = 96; fc.setAttribute('aria-hidden', 'true');
      fc.style.cssText = 'position:absolute;right:2px;bottom:2px;width:22%;height:auto;aspect-ratio:40/96;box-shadow:0 1px 3px #000a;pointer-events:none';
      if (A.drawCardFlag(fc, name) && el.isConnected) el.appendChild(fc);
    }).catch(() => {});
  }).catch(() => {});
}

export const CSS = `
.olh{position:fixed;inset:0;z-index:8000;background:radial-gradient(120% 90% at 50% 0%,#2a2016,#0e0b08 70%);color:#ece4d2;font-family:inherit;display:flex;flex-direction:column;padding:max(8px,env(safe-area-inset-top)) max(16px,env(safe-area-inset-right)) max(8px,env(safe-area-inset-bottom)) max(16px,env(safe-area-inset-left));box-sizing:border-box;overflow:hidden}
.olh button{font:inherit;color:inherit;cursor:pointer;touch-action:manipulation}
.olh .ol-top{display:flex;align-items:center;gap:12px;min-height:44px;flex:none}
.olh .ol-back{min-width:44px;min-height:44px;background:#14120fcc;border:1px solid #c2a25a;border-radius:4px;font-size:18px}
.olh h2{margin:0;font-size:max(18px,calc(20px * var(--text-scale,1)));letter-spacing:.18em;color:#d9b45a;font-weight:600}
.olh .ol-go{min-height:48px;padding:0 22px;border:1px solid #e0a070;border-radius:4px;background:linear-gradient(180deg,#c0482e,#8e2a1e);font-size:max(16px,calc(17px * var(--text-scale,1)));letter-spacing:.08em}
.olh .ol-go:disabled{opacity:.45}
/* 家を選ぶ */
.olh .ol-houses{flex:1;min-height:0;display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:10px;align-items:stretch;padding:10px 0}
.olh .ol-house{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;border:1px solid #6a5a3a;border-radius:6px;background:#17130ecc;padding:10px 4px;min-height:44px}
.olh .ol-house[aria-pressed=true]{border:2px solid #d9b45a;box-shadow:0 0 18px rgba(217,180,90,.35);background:#241b12}
.olh .ol-house canvas{border-radius:3px;box-shadow:0 2px 8px #000a}
.olh .ol-house b{font-size:max(15px,calc(16px * var(--text-scale,1)));letter-spacing:.1em}
.olh .ol-four{display:grid;grid-template-columns:repeat(2,26px);gap:3px}
.olh .ol-four i{width:26px;height:6px;border-radius:2px}
.olh .ol-foot{display:flex;justify-content:flex-end;align-items:center;gap:12px;flex:none;min-height:52px}
.olh .ol-pick{display:flex;gap:10px;align-items:center;margin-right:auto;min-width:0}
/* 軍団編成 */
.olh .ol-meter{margin-left:auto;display:flex;align-items:center;gap:10px}
.olh .ol-cells{display:grid;grid-template-columns:repeat(13,8px);grid-auto-rows:8px;gap:2px}
.olh .ol-cells i{background:#3a3226;border-radius:1px}.olh .ol-cells i.on{background:#d9b45a}.olh .ol-cells i.over{background:#c0482e}
.olh .ol-meter b{font-size:16px;min-width:3.6em;text-align:right;font-variant-numeric:tabular-nums}
.olh .ol-meter.bad{animation:olShake .35s}
@keyframes olShake{25%{transform:translateX(-4px)}75%{transform:translateX(4px)}}
.olh .ol-slots{flex:1;min-height:0;display:grid;grid-template-columns:1.25fr 1fr 1fr 1fr;gap:10px;padding:8px 0}
.olh .ol-slot{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;gap:4px;border:1px solid #6a5a3a;border-radius:6px;background:#17130ecc;padding:8px 6px 6px;min-height:44px}
.olh .ol-slot[aria-pressed=true]{border:2px solid #d9b45a;background:#241b12}
.olh .ol-slot .ol-role{font-size:13px;color:#c9b98f;letter-spacing:.12em}
.olh .ol-slot .ol-hon{position:absolute;top:6px;left:6px;width:16px;height:22px;background:#d9b45a;clip-path:polygon(0 0,100% 0,100% 70%,50% 100%,0 70%)}
.olh .ol-face{width:64px;height:64px;border-radius:50%;overflow:hidden;display:grid;place-items:center;background:#2a241c;border:3px solid var(--rc,#6a5a3a)}
.olh .ol-face img{width:100%;height:100%;object-fit:cover;object-position:50% 20%}
.olh .ol-name{font-size:max(15px,calc(15px * var(--text-scale,1)));line-height:1.3;text-align:center}
.olh .ol-rare{font-size:12px;font-weight:700;padding:0 6px;border-radius:3px;color:#14120f;background:var(--rc)}
.olh .ol-katas{display:flex;gap:4px;margin-top:auto}
.olh .ol-kata{width:44px;height:44px;display:grid;place-items:center;border:1px solid #4a3f2c;border-radius:4px;background:#100d0a;padding:0}
.olh .ol-kata[aria-pressed=true]{border-color:#d9b45a;background:#2e2414}
.olh .ol-katas .ol-kata:not([aria-pressed=true]){display:none}
.olh .ol-slot[aria-pressed=true] .ol-katas .ol-kata{display:grid}
.olh .ol-shelf{flex:none;display:flex;gap:8px;overflow-x:auto;padding:4px 0 2px;min-height:96px;overscroll-behavior:contain}
.olh .ol-card{flex:none;width:84px;display:flex;flex-direction:column;align-items:center;gap:2px;border:1px solid #4a3f2c;border-radius:6px;background:#13100c;padding:6px 2px}
.olh .ol-card .ol-face{width:44px;height:44px;border-width:2px}
.olh .ol-card .ol-name{font-size:12px}
.olh .ol-card.used{opacity:.4}
.olh .ol-card.nofit{opacity:.3;border-color:#c0482e}
.olh .ol-card .ol-rare{font-size:12px;line-height:1.3}
/* 初めての人の道しるべ（字を足さず光だけ）：次に押す所を金の光で脈打たせる。動きを減らす設定では光の輪だけ */
.olh .ol-next{box-shadow:0 0 0 2px #f4d98a,0 0 18px 4px rgba(244,217,138,.55)!important;animation:olNext 1.6s ease-in-out infinite}
@keyframes olNext{50%{box-shadow:0 0 0 2px #f4d98a,0 0 30px 10px rgba(244,217,138,.2)}}
.olh .ol-hint{animation:olHint 2.4s ease-in-out infinite}
@keyframes olHint{50%{border-color:#d9b45a;background:#221a11}}
@media (prefers-reduced-motion:reduce){.olh .ol-next,.olh .ol-hint{animation:none}}
/* PC・大きな画面：札が縦に伸びて空くので、幅を1240pxに収め、顔と紋を大きく */
@media (min-height:700px) and (min-width:1000px){.olh{padding-inline:max(24px,calc((100vw - 1240px) / 2))}.olh .ol-houses,.olh .ol-slots{max-height:460px;align-self:stretch;margin-block:auto}.olh .ol-face{width:112px;height:112px}.olh .ol-slot .ol-name{font-size:18px}.olh .ol-card{width:104px}.olh .ol-card .ol-face{width:60px;height:60px}.olh .ol-house canvas{width:120px!important;height:120px!important}.olh h2{font-size:24px}.olh .ol-cells{grid-template-columns:repeat(13,11px);grid-auto-rows:11px}}
@media (max-height:500px){.olh .ol-face{width:52px;height:52px}.olh .ol-slots{padding:4px 0}.olh .ol-house canvas{width:56px!important;height:56px!important}}
@media (max-width:720px){.olh .ol-houses{grid-template-columns:repeat(3,minmax(0,1fr))}.olh .ol-slots{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (prefers-reduced-motion:reduce){.olh .ol-meter.bad{animation:none}}
`;
export function root(label) {
  document.querySelector('.olh')?.remove();
  const el = document.createElement('div'); el.className = 'olh'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', label);
  el.innerHTML = `<style>${CSS}</style>`; document.body.appendChild(el); return el;
}

