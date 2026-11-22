// 問屋（K598・docs/home_economy_1121.md の頭の修正版）。ホームから直に入る店（城下町の施設ではない）。出陣の前の支度（hub.js preCard）からも［問屋へ］。
//   openTonya(G, { onClose, tab }) で画面の上に開く。閉じたら onClose()（開いた画面はそのまま残る）。
//   銭は筋書きの G.kan（貫）を文の数で「銭 4,850」と書く。小判はオンラインの箱（online/house.js の toyo.kin）。銭そのものは現金で売らない（小判から替えるだけ）。
//   品は今の作りをそのまま使う：鎧と槍・刀は state.js の ITEMS（着けた物が戦の姿と強さに効く）、筒の違いは gun_kinds.js、馬は HORSES、兵は choku.js（直属兵＝組の名簿）。
//   課金だけの最強の品は作らない。おすすめは今の位と次の戦から3〜5品（攻略に要る物としては出さない）。
import { ITEMS, HORSES, BATTLES, RANKS, ladderStep, addKan, save } from './state.js';
import { horsePrice } from './horse_price.js';
import { GUN_KINDS, gunKindOf } from './gun_kinds.js';
import { CHOKU_KINDS, chokuCap, chokuAlive, chokuNeed, chokuAdd, refillPlan, zeniOf, kanOfZeni } from './choku.js';
import { sfx } from './audio.js';
import { itemShot, itemShotCached } from './item_shots.js';   // K608 ⑤：品の絵はゲームの3D の本物を撮った物
import { addEn } from './i18n.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const num = (n) => Math.round(n).toLocaleString('ja-JP');
const OKEY = 'risshin_online_v1';
const spendLog = (G, n, kan) => { (G.spend = G.spend || []).push({ n, kan: Math.round(kan * 1000) / 1000 }); };   // toiya.js と同じ帳（重い城下の部品を読まない）   // online/house.js の箱（小判はここの toyo.kin）

// ---- 小判 → 銭（例 小判100 → 銭1,000）。小判の箱はオンラインの保存。家を選ぶ前でも小判だけは持てる ----
export const KOBAN_TO_ZENI = [{ koban: 100, zeni: 1000 }, { koban: 500, zeni: 5000 }, { koban: 1000, zeni: 10000 }];
function onlineBox() { try { return JSON.parse(localStorage.getItem(OKEY) || 'null') || {}; } catch (e) { return {}; } }
export const kobanOf = () => Math.max(0, Math.floor(onlineBox().toyo?.kin || 0));
async function saveBox(o) {
  try { const H = await import('./online/house.js'); H.saveOnline(o); } catch (e) { try { localStorage.setItem(OKEY, JSON.stringify(o)); } catch (e2) { /* 持てない */ } }
}
// 小判を銭に替える。足りなければ false（何も変えない）
export async function kobanToZeni(G, opt) {
  const o = onlineBox();
  const have = Math.max(0, Math.floor(o.toyo?.kin || 0));
  if (!G || !opt || have < opt.koban) return false;
  o.toyo = { ...(o.toyo || {}), kin: have - opt.koban };
  o.toyo.kobanLog = [...(o.toyo.kobanLog || []).slice(-30), { t: Date.now(), koban: opt.koban, zeni: opt.zeni }];
  await saveBox(o);
  addKan(G, kanOfZeni(opt.zeni)); spendLog(G, `小判${opt.koban}を銭に`, -kanOfZeni(opt.zeni)); save(G);
  return true;
}

// ---- 品の並び ----
const TABS = [['rec', 'おすすめ'], ['armor', '鎧'], ['blade', '刀・槍'], ['ranged', '弓・鉄砲'], ['horse', '馬'], ['troop', '兵']];
const TAG = { body0: '軽装', body1: '標準', body2: '重装', spear5: '短槍', spear0: '標準', spear1: '標準', spear3: '長槍', spear2: '大身', spear4: '十文字', katana: '刀' };
const ARMOR = ['body0', 'body1', 'body2', 'hat2', 'hat3', 'kote', 'haidate', 'suneate', 'haori'];
const BLADE = ['spear5', 'spear1', 'spear3', 'spear2', 'spear4', 'katana', 'spear0'];
const GUN_BATTLE = /nagashino|shitara|nodafuku|saika|kizu|negoro|kishu|sekigahara|tennoji|sanadamaru|osaka|kashii|nagashima/;
const SIEGE_BATTLE = /odani|inabayama|miki|tottori|arioka|takatenjin|odawara|oshi|honjo|nanao|takato|ueda|shigisan|minowa|gifu|fushimi/;
const priceZ = (kan) => Math.round((kan || 0) * 1000);
const rank = (G) => G.rank || 0;

// 指の端末で鍵の名を出さない（城下の問屋 toiya.js の tnote と同じ考え）。弓・刀・鉄砲は短い言い方に
const NOTE = { yumi: '遠くの敵を射る。山なりにも飛び、矢は二十四本', katana: '腰の打刀。速く斬れ、受け流しやすい', teppo: '六匁玉の並の火縄銃' };
function itemState(G, id) {
  const it = ITEMS[id]; if (!it) return null;
  const own = (G.owned || []).includes(id), worn = G.equip && G.equip[it.slot] === id;
  const cost = priceZ(it.cost);
  const lock = it.minRank && rank(G) < it.minRank ? `${RANKS[it.minRank].name}から` : '';
  return { kind: 'item', id, it, own, worn, cost, lock, name: it.name, note: NOTE[id] || it.note, tag: TAG[id] || '' };
}
function gunState(G, k) {
  const id = k.item, own = k.id === 'nami' ? (G.owned || []).includes('teppo') : (G.owned || []).includes(id);
  const cost = priceZ(k.id === 'nami' ? ITEMS.teppo.cost : k.cost);
  const lock = k.minRank && rank(G) < k.minRank ? `${RANKS[k.minRank].name}から` : '';
  return { kind: 'gun', id: k.id, k, own, worn: own && gunKindOf(G).id === k.id, cost, lock, name: k.name, note: k.note, tag: '鉄砲' };
}
function horseState(G, id) {
  const h = HORSES[id]; if (!h || h.spoil) return null;
  const own = id === 'tsukikage' ? ladderStep(G) >= 2 : (G.horses || []).includes(id);
  const lock = ladderStep(G) < 2 ? '足軽大将から' : '';
  return { kind: 'horse', id, h, own, worn: own && ((G.horse || {}).id || 'tsukikage') === id, cost: priceZ(horsePrice(G, h)), lock, name: h.name, note: h.note, tag: h.grade || '' };
}
// おすすめ：今の位と次の戦に合わせて3〜5品（補充が要れば一番上）
function recommend(G) {
  const b = BATTLES[G.battle] || {}, id = String(b.id || '');
  const out = [];
  const add = (s) => { if (s && !s.own && !s.lock && !out.some((q) => q.kind === s.kind && q.id === s.id)) out.push(s); };
  if (chokuNeed(G) > 0) out.push({ kind: 'refill' });
  if (GUN_BATTLE.test(id)) { add(gunState(G, GUN_KINDS.nami)); add(gunState(G, GUN_KINDS.tan)); add(itemState(G, 'body0')); }
  if (SIEGE_BATTLE.test(id)) { add(itemState(G, 'body2')); add(itemState(G, 'hat2')); }
  add(itemState(G, 'body1'));
  add(itemState(G, rank(G) >= 2 ? 'spear3' : 'spear5'));
  add(itemState(G, 'hat2'));
  if (ladderStep(G) >= 2 && !(G.horses || []).some((h) => h !== 'tsukikage')) add(horseState(G, 'hayate'));
  for (const x of ['kote', 'katana', 'haidate', 'suneate', 'spear1', 'yumi']) if (out.length < 3) add(itemState(G, x));
  return out.slice(0, 5);
}

// ---- 絵（字に頼らない小さな形） ----
const IC = {
  body: '<path d="M7 4h10l3 4-2 3v9H6v-9L4 8z"/><path d="M6 12h12M6 16h12"/>',
  hat: '<path d="M3 15c2-7 16-7 18 0z"/><path d="M12 5v4"/>',
  arm: '<path d="M6 4h6l2 8-3 8H7l1-8z"/>', leg: '<path d="M8 3h8l-1 18h-6z"/>', coat: '<path d="M6 3h12l2 18H4z"/><path d="M12 3v18"/>',
  spear: '<path d="M4 20 18 6"/><path d="m18 6 2-3-3 1z"/>', katana: '<path d="M5 19c6-4 11-9 14-15"/><path d="M6 15l3 3"/>',
  gun: '<path d="M2 12h15l4-2v3l-4 1H9l-2 4H5l1-4H2z"/>', bow: '<path d="M7 3c8 4 8 14 0 18"/><path d="M7 3v18"/>',
  horse: '<path d="M5 20v-7l3-6 5-2 3 3h3l-1 3-3 1-1 8"/><path d="M8 13h8"/>', troop: '<circle cx="8" cy="7" r="3"/><circle cx="16" cy="7" r="3"/><path d="M3 20c0-5 3-7 5-7s5 2 5 7M11 20c0-5 3-7 5-7s5 2 5 7"/>',
  coin: '<circle cx="12" cy="12" r="9"/><rect x="9.5" y="9.5" width="5" height="5"/>',
};
const SLOT_IC = { body: 'body', hat: 'hat', arm: 'arm', thigh: 'leg', shin: 'leg', coat: 'coat', side: 'katana', weapon: 'spear', bow: 'bow', gun: 'gun' };
// 撮る品の鍵（item_shots.js）。兵は撮らない（今の小さな絵のまま）
const SPEAR_SHOT = { spear0: 'spear:su', spear1: 'spear:su', spear2: 'spear:omi', spear3: 'spear:naga', spear4: 'spear:jumonji', spear5: 'spear:short' };
function shotKey(s) {
  if (s.kind === 'gun') return 'gun:' + s.id;
  if (s.kind === 'horse') return 'horse:' + s.id;
  if (s.kind !== 'item') return null;
  if (SPEAR_SHOT[s.id]) return SPEAR_SHOT[s.id];
  if (s.id === 'katana') return 'sword';
  if (s.id === 'yumi') return 'bow';
  if (s.id === 'teppo') return 'gun:nami';
  return 'armor:' + s.id;
}
const svg = (k, cls = 'tny-ic') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${IC[k] || IC.troop}</svg>`;
const icOf = (s) => s.kind === 'gun' ? 'gun' : s.kind === 'horse' ? 'horse' : SLOT_IC[s.it?.slot] || 'spear';
// 鎧・槍の効き目を短い棒で（守り・動き／間合い・速さ）。鉄砲は 命中・重さ・装填・取り回し の五段
function bars(s) {
  const pip = (label, v) => `<span class="tny-pip" aria-label="${label} ${v}／5"><i>${label}</i>${[1, 2, 3, 4, 5].map((n) => `<b class="${n <= v ? 'on' : ''}"></b>`).join('')}</span>`;
  if (s.kind === 'gun') { const t = s.k.stars; return pip('命中', t.aim) + pip('軽さ', t.weight) + pip('装填', t.load) + pip('取り回し', t.handle) + `<small>${s.k.kg}kg・威力は同じ</small>`; }
  if (s.kind === 'horse') return pip('速さ', Math.round(s.h.speed * 5 - 0.6)) + pip('体力', Math.min(5, Math.round(s.h.hp * 3.6 - 0.6))) + pip('息', Math.min(5, Math.round(s.h.breath * 3.6 - 0.6)));
  const it = s.it || {};
  if (it.slot === 'body') { const d = { body0: [1, 5], body1: [3, 3], body2: [5, 1] }[s.id] || [2, 3]; return pip('守り', d[0]) + pip('動き', d[1]); }
  if (it.slot === 'weapon') { const d = { spear5: [2, 5, 3], spear0: [3, 3, 2], spear1: [3, 3, 3], spear3: [5, 2, 3], spear2: [4, 1, 5], spear4: [3, 3, 4] }[s.id] || [3, 3, 3]; return pip('間合い', d[0]) + pip('速さ', d[1]) + pip('威力', d[2]); }
  return '';
}
const CSS = `
.tny{position:fixed;inset:0;z-index:9000;display:flex;flex-direction:column;color:#efe6d2;font:15px/1.45 "Noto Serif JP","Hiragino Mincho ProN",serif;
  background:linear-gradient(180deg,#1d1710 0%,#120e0a 100%);padding:max(6px,env(safe-area-inset-top)) max(16px,env(safe-area-inset-right)) max(6px,env(safe-area-inset-bottom)) max(16px,env(safe-area-inset-left));box-sizing:border-box}
.tny *{box-sizing:border-box}.tny button{font:inherit;color:inherit;min-height:44px;cursor:pointer;border-radius:4px}
.tny-top{display:flex;align-items:center;gap:8px;flex:none;min-height:50px}
.tny-top h1{margin:0 auto 0 4px;font-size:20px;letter-spacing:.3em;color:#e8c77a;font-weight:600}
.tny-back{min-width:44px;padding:0 12px;background:#0007;border:1px solid #8a7350}
.tny-zeni{display:flex;align-items:center;gap:6px;padding:0 12px;min-height:44px;border:1px solid #8a7350;border-radius:22px;background:#0007;white-space:nowrap}
.tny-zeni b{font-size:18px;color:#f3d68a;font-variant-numeric:tabular-nums}.tny-zeni .tny-ic{width:20px;height:20px}
.tny-add{padding:0 12px;background:#5a1f17;border:1px solid #e8c77a;white-space:nowrap}
.tny-first{flex:1 1 100%;margin:0;padding:0 0 0 12px;border-left:3px solid #e8c77a;background:#e8c77a1a;font-size:14px;display:flex;align-items:center;gap:8px}
.tny-first button{margin-left:auto;padding:0 12px;background:#0006;border:1px solid #8a7350}
.tny-main{flex:1;display:flex;gap:10px;min-height:0;margin-top:6px}
.tny-tabs{flex:none;display:flex;flex-direction:column;gap:5px;width:112px;overflow-y:auto}
.tny-tabs button{text-align:left;padding:0 10px;background:#0006;border:1px solid #5a4a32}
.tny-tabs button[aria-selected=true]{background:#5a1f17;border-color:#e8c77a;color:#fff3d4}
.tny-list{flex:1;overflow-y:auto;display:flex;flex-wrap:wrap;gap:8px;align-content:flex-start;align-items:stretch;padding-bottom:12px;-webkit-overflow-scrolling:touch}
.tny-c{flex:1 1 250px;max-width:100%;display:flex;gap:10px;padding:8px 10px;border:1px solid #5a4a32;background:#00000059;border-radius:4px;min-height:96px}
.tny-c.worn{border-color:#9fc08a}.tny-c.lock{opacity:.55}
.tny-shot{width:104px;height:70px;flex:none;display:grid;place-items:center;background:radial-gradient(ellipse at 50% 60%,#3a2c1c,#120e0a);border-radius:4px;overflow:hidden}.tny-shot img{width:100%;height:100%;object-fit:cover;display:block}
.tny-ic{width:34px;height:34px;flex:none;fill:none;stroke:#e8c77a;stroke-width:1.6;stroke-linejoin:round;stroke-linecap:round}
.tny-b{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}
.tny-n{display:flex;align-items:baseline;gap:6px;flex-wrap:wrap}.tny-n b{font-size:16px}
.tny-tag{font-size:12px;padding:0 6px;border:1px solid #8a7350;border-radius:10px;color:#e8d6a8}
.tny-b>*{flex-shrink:0}
.tny-note{font-size:12.5px;color:#cbbd9c;line-height:1.4;max-height:2.8em;overflow:hidden}
.tny-pips{display:flex;flex-wrap:wrap;gap:2px 10px;align-items:center;font-size:12px}.tny-pips small{color:#cbbd9c}
.tny-pip{display:inline-flex;align-items:center;gap:2px}.tny-pip i{font-style:normal;color:#cbbd9c;margin-right:3px}
.tny-pip b{width:8px;height:8px;border:1px solid #8a7350;display:inline-block}.tny-pip b.on{background:#e8c77a;border-color:#e8c77a}
.tny-act{display:flex;align-items:center;gap:8px;margin-top:auto;flex-wrap:wrap}
.tny-pr{font-variant-numeric:tabular-nums;color:#f3d68a;font-size:14px}.tny-why{font-size:12.5px;color:#e3a08c}
.tny-act button{margin-left:auto;padding:0 14px;background:#5a1f17;border:1px solid #e8c77a}
.tny-act button.sub{background:#24402a;border-color:#9fc08a}.tny-act button:disabled{opacity:.45;cursor:default}
.tny-ok{margin-left:auto;font-size:13px;color:#b8d8a0}
.tny-troop{flex:1 1 100%;display:flex;flex-wrap:wrap;align-items:center;gap:8px 16px;padding:8px 12px;border:1px solid #8a7350;background:#2a1c10aa;border-radius:4px}
.tny-troop .tny-cnt{font-size:20px;color:#f3d68a;font-variant-numeric:tabular-nums}
.tny-bar{width:140px;height:8px;background:#0008;border:1px solid #8a7350;position:relative}.tny-bar b{position:absolute;inset:0;right:auto;background:#9fc08a}
.tny-troop button{margin-left:auto;padding:0 14px;background:#5a1f17;border:1px solid #e8c77a}
.tny-row2{display:flex;gap:6px;margin-top:auto}.tny-row2 button{flex:1;padding:0 6px;background:#5a1f17;border:1px solid #e8c77a;font-size:14px}
.tny-row2 button small{display:block;font-size:12px;color:#f3d68a;line-height:1.2}
.tny-row2 button:disabled{opacity:.45;cursor:default}
.tny-empty{flex:1 1 100%;padding:18px;text-align:center;color:#cbbd9c}
.tny-ov{position:absolute;inset:0;background:#000a;display:flex;align-items:center;justify-content:center;padding:16px}
.tny-ov:empty{display:none}
.tny-box{width:min(460px,100%);max-height:100%;overflow-y:auto;background:#1d1710;border:1px solid #e8c77a;border-radius:6px;padding:12px 16px;display:flex;flex-direction:column;gap:8px}
.tny-box h2{margin:0;font-size:17px;color:#e8c77a}.tny-box p{margin:0;font-size:14px;color:#ddd0b2}
.tny-box .tny-btns{display:flex;gap:8px;flex-wrap:wrap}.tny-box .tny-btns button{flex:1;min-width:120px;padding:0 10px;background:#0007;border:1px solid #8a7350}
.tny-box .tny-btns button.go{background:#5a1f17;border-color:#e8c77a}
.tny-box .tny-btns button small{display:block;font-size:12px;color:#f3d68a;line-height:1.2}
.tny-box .tny-btns button:disabled{opacity:.45}
.tny-toast{position:absolute;left:50%;bottom:max(10px,env(safe-area-inset-bottom));transform:translateX(-50%);padding:6px 14px;background:#24402aee;border:1px solid #9fc08a;border-radius:4px;font-size:14px;pointer-events:none}
.tny-toast:empty{display:none}
@media (max-height:430px){.tny-tabs{width:96px}.tny-tabs button{min-height:44px;font-size:14px;padding:0 8px}.tny-c{min-height:88px;padding:6px 8px}.tny-c{flex-basis:230px}}
@media (max-width:600px){.tny-main{flex-direction:column}.tny-tabs{flex-direction:row;width:auto;overflow-x:auto;flex:none}.tny-tabs button{white-space:nowrap}}
`;

let EN_DONE = false;
function en() {
  if (EN_DONE) return; EN_DONE = true;
  addEn([['問屋', 'Merchant'], ['おすすめ', 'Picks'], ['鎧', 'Armor'], ['刀・槍', 'Spears & swords'], ['弓・鉄砲', 'Bows & guns'], ['馬', 'Horses'], ['兵', 'Troops'],
    ['銭を追加', 'Add coin'], ['戻る', 'Back'], ['買う', 'Buy'], ['着ける', 'Equip'], ['使う', 'Use'], ['乗る', 'Ride'], ['着用中', 'Equipped'], ['使用中', 'In use'], ['騎乗中', 'Riding'],
    ['ここで購入した装備・兵は出陣時に使用できます', 'Gear and troops bought here are used when you march out.'], ['分かった', 'Got it'],
    ['直属兵', 'Your troops'], ['不足分を一括補充', 'Refill all missing'], ['兵を雇う', 'Hire troops'], ['兵を補充', 'Refill troops'],
    ['小判が不足しています', 'Not enough koban'], ['小判を購入', 'Buy koban'], ['小判を銭に替える', 'Exchange koban for coin'], ['やめる', 'Cancel'],
    ['軽装', 'Light'], ['標準', 'Standard'], ['重装', 'Heavy'], ['短槍', 'Short spear'], ['長槍', 'Long spear'], ['命中', 'Aim'], ['軽さ', 'Light'], ['装填', 'Reload'], ['取り回し', 'Handling'],
    ['守り', 'Guard'], ['動き', 'Move'], ['間合い', 'Reach'], ['速さ', 'Speed'], ['威力', 'Power'], ['体力', 'Stamina'], ['息', 'Breath']]);
}

// ---- 開く ----
export function openTonya(G, o = {}) {
  if (!G) return () => {};
  en();
  if (!document.getElementById('tny-css')) { const st = document.createElement('style'); st.id = 'tny-css'; st.textContent = CSS; document.head.appendChild(st); }
  const el = document.createElement('div');
  el.className = 'tny'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', '問屋');
  document.body.appendChild(el);
  let tab = TABS.some(([k]) => k === o.tab) ? o.tab : 'rec';
  let toastT = 0;
  const close = () => { if (!el.isConnected) return; el.remove(); document.removeEventListener('keydown', onKey, true); save(G); o.onClose?.(); };
  const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); const ov = el.querySelector('.tny-ov'); if (ov && ov.innerHTML) ov.innerHTML = ''; else close(); } };
  document.addEventListener('keydown', onKey, true);
  const toast = (t) => { const x = el.querySelector('.tny-toast'); if (!x) return; x.textContent = t; clearTimeout(toastT); toastT = setTimeout(() => { if (x.isConnected) x.textContent = ''; }, 2400); };
  const z = () => zeniOf(G);

  const card = (s) => {
    const cls = `tny-c${s.worn ? ' worn' : ''}${s.lock ? ' lock' : ''}`;
    let act;
    if (s.lock) act = `<span class="tny-why">${esc(s.lock)}</span>`;
    else if (s.worn) act = `<span class="tny-ok">${s.kind === 'horse' ? '騎乗中' : s.kind === 'gun' ? '使用中' : '着用中'}</span>`;
    else if (s.own) act = (s.kind === 'item' && (s.it.slot === 'gun' || s.it.slot === 'bow')) ? '<span class="tny-ok">持っている</span>' : `<button class="sub" data-eq="${s.kind}:${s.id}">${s.kind === 'horse' ? '乗る' : s.kind === 'gun' ? '使う' : '着ける'}</button>`;
    else act = `<span class="tny-pr">銭 ${num(s.cost)}</span>${s.cost > z() ? `<span class="tny-why">あと ${num(s.cost - z())}</span>` : ''}<button data-buy="${s.kind}:${s.id}"${s.cost > z() ? ' disabled' : ''}>買う</button>`;
    return `<div class="${cls}">${(() => { const k = shotKey(s), u = k && itemShotCached(k); return k ? `<span class="tny-shot" data-shot="${k}">${u ? `<img src="${u}" alt="">` : svg(icOf(s))}</span>` : svg(icOf(s)); })()}<div class="tny-b"><div class="tny-n"><b>${esc(s.name)}</b>${s.tag ? `<span class="tny-tag">${esc(s.tag)}</span>` : ''}</div>
      <div class="tny-pips">${bars(s)}</div><div class="tny-note">${esc(s.note || '')}</div><div class="tny-act">${act}</div></div></div>`;
  };
  const troopHead = () => {
    const cap = chokuCap(G), alive = chokuAlive(G), need = chokuNeed(G), plan = refillPlan(G);
    if (!cap) return `<div class="tny-troop">${svg('troop')}<span>${'足軽に上がると直属兵を持てます'}</span></div>`;
    return `<div class="tny-troop">${svg('troop')}<span>直属兵 <b class="tny-cnt">${alive}/${cap}</b></span><span class="tny-bar" aria-hidden="true"><b style="width:${Math.min(100, alive / cap * 100)}%"></b></span>
      ${need ? `<button data-refill="1"${plan.cost > z() ? ' disabled' : ''}>不足分を一括補充（${need}人・銭 ${num(plan.cost)}）</button>` : '<span class="tny-ok">揃っている</span>'}</div>`;
  };
  const troopCard = (kind) => {
    const d = CHOKU_KINDS[kind], need = chokuNeed(G);
    const lock = rank(G) < d.minRank ? `${RANKS[d.minRank].name}から` : '';
    const nPack = Math.min(d.pack, need), packCost = nPack === d.pack ? d.packCost : nPack * d.one;
    return `<div class="tny-c${lock ? ' lock' : ''}">${svg(kind === 'gun' ? 'gun' : kind === 'bow' ? 'bow' : kind === 'cavalry' ? 'horse' : 'spear')}<div class="tny-b"><div class="tny-n"><b>${esc(d.name)}</b><span class="tny-tag">1人 銭${d.one}</span></div>
      <div class="tny-note">${d.pack}人 銭${num(d.packCost)}</div>
      ${lock ? `<div class="tny-act"><span class="tny-why">${esc(lock)}</span></div>` : `<div class="tny-row2"><button data-hire="${kind}:1"${!need || d.one > z() ? ' disabled' : ''}>1人<small>銭 ${d.one}</small></button>
      <button data-hire="${kind}:${nPack || d.pack}"${!nPack || packCost > z() ? ' disabled' : ''}>${nPack || d.pack}人<small>銭 ${num(nPack ? packCost : d.packCost)}</small></button></div>`}</div></div>`;
  };
  const listHtml = () => {
    if (tab === 'rec') {
      const r = recommend(G);
      return r.map((s) => (s.kind === 'refill' ? troopHead() : card(s))).join('') || '<div class="tny-empty">いまは揃っている</div>';
    }
    if (tab === 'armor') return ARMOR.map((id) => itemState(G, id)).filter(Boolean).map(card).join('');
    if (tab === 'blade') return BLADE.map((id) => itemState(G, id)).filter((s) => s && (s.cost || s.own)).map(card).join('');
    if (tab === 'ranged') return [itemState(G, 'yumi'), ...Object.values(GUN_KINDS).map((k) => gunState(G, k))].filter(Boolean).map(card).join('');
    if (tab === 'horse') return ['tsukikage', 'daba', 'hayate', 'iwane'].map((id) => horseState(G, id)).filter(Boolean).map(card).join('');
    return troopHead() + Object.keys(CHOKU_KINDS).map(troopCard).join('');
  };
  const draw = () => {
    const first = !G.tonyaSeen;
    const scroll = el.querySelector('.tny-list')?.scrollTop || 0;
    el.innerHTML = `<div class="tny-top"><button class="tny-back" data-a="close" aria-label="戻る">✕ 戻る</button><h1>問屋</h1>
      <span class="tny-zeni" aria-label="銭 ${num(z())}">${svg('coin')}<span>銭</span><b>${num(z())}</b></span><button class="tny-add" data-a="add">銭を追加</button></div>
      <div class="tny-main"><div class="tny-tabs" role="tablist">${TABS.map(([k, n]) => `<button role="tab" data-tab="${k}" aria-selected="${k === tab}">${n}</button>`).join('')}</div>
      <div class="tny-list" role="tabpanel">${first ? '<div class="tny-first" role="status">ここで購入した装備・兵は出陣時に使用できます<button data-a="seen">分かった</button></div>' : ''}${listHtml()}</div></div><div class="tny-ov"></div><div class="tny-toast" role="status"></div>`;
    el.querySelector('.tny-list').scrollTop = scroll;
    bind();
    // 撮った絵を順に差し込む（撮れなければ小さな絵のまま）
    for (const sp of el.querySelectorAll('.tny-shot[data-shot]')) {
      if (sp.querySelector('img')) continue;
      itemShot(sp.dataset.shot).then((u) => { if (u && sp.isConnected) sp.innerHTML = `<img src="${u}" alt="">`; });
    }
  };
  const done = (msg) => { save(G); sfx('merit'); draw(); toast(msg); };
  // 取り消せない買い物：所持の半分を超える時だけ、その場で確かめる
  const sure = (cost, label, go) => {
    if (cost <= z() / 2) return go();
    ask(`${label}`, `銭 ${num(cost)}（買うと残り ${num(z() - cost)}）。元に戻せません。`, [[`銭 ${num(cost)}で買う`, go, true], ['やめる', null]]);
  };
  const ask = (title, body, btns) => {
    const ov = el.querySelector('.tny-ov');
    ov.innerHTML = `<div class="tny-box" role="alertdialog" aria-label="${esc(title)}"><h2>${esc(title)}</h2>${body ? `<p>${esc(body)}</p>` : ''}<div class="tny-btns">${btns.map(([l, , go, dis], i) => `<button data-i="${i}" class="${go ? 'go' : ''}"${dis ? ' disabled' : ''}>${l}</button>`).join('')}</div></div>`;
    ov.querySelectorAll('[data-i]').forEach((b) => b.onclick = () => { const f = btns[+b.dataset.i][1]; ov.innerHTML = ''; f?.(); });
    ov.querySelector('button.go:not([disabled]), button')?.focus({ preventScroll: true });
  };
  const buy = (kind, id) => {
    if (kind === 'item') {
      const s = itemState(G, id); if (!s || s.own || s.lock || s.cost > z()) return;
      sure(s.cost, `${s.name}を買う`, () => {
        if ((G.owned || []).includes(id) || s.cost > z()) return;
        addKan(G, -kanOfZeni(s.cost)); spendLog(G, s.name, kanOfZeni(s.cost)); G.owned.push(id);
        if (G.equip && s.it.slot in G.equip && s.it.slot !== 'side') G.equip[s.it.slot] = id;
        if (s.it.slot === 'gun' && !G.gunKind) G.gunKind = 'nami';
        done(`${s.name}を買った`);
      });
    } else if (kind === 'gun') {
      const k = GUN_KINDS[id], s = gunState(G, k); if (s.own || s.lock || s.cost > z()) return;
      sure(s.cost, `${s.name}を買う`, () => {
        addKan(G, -kanOfZeni(s.cost)); spendLog(G, s.name, kanOfZeni(s.cost));
        G.owned.push(k.id === 'nami' ? 'teppo' : k.item); G.gunKind = k.id;
        done(`${s.name}を買った`);
      });
    } else if (kind === 'horse') {
      const s = horseState(G, id); if (!s || s.own || s.lock || s.cost > z()) return;
      sure(s.cost, `${s.name}を買う`, () => {
        addKan(G, -kanOfZeni(s.cost)); spendLog(G, s.name, kanOfZeni(s.cost));
        G.horses = [...(G.horses || ['tsukikage']), id];
        G.horseBonds = { ...(G.horseBonds || {}), [id]: (G.horseBonds || {})[id] || { id, bond: 0 } };
        done(`${s.name}を買った`);
      });
    }
  };
  const equip = (kind, id) => {
    if (kind === 'item') { const it = ITEMS[id]; if (it && G.owned.includes(id) && G.equip && it.slot in G.equip) G.equip[it.slot] = id; }
    else if (kind === 'gun') G.gunKind = id;
    else if (kind === 'horse') G.horse = { ...((G.horseBonds || {})[id] || { id, bond: 0 }), id };
    save(G); sfx('ui'); draw();
  };
  const hire = (kind, n) => {
    const d = CHOKU_KINDS[kind]; n = Math.min(n, chokuNeed(G)); if (!d || n <= 0 || rank(G) < d.minRank) return;
    const cost = n === d.pack ? d.packCost : n * d.one; if (cost > z()) return;
    sure(cost, `${d.name}を${n}人雇う`, () => {
      if (chokuNeed(G) < n || cost > z()) return;
      addKan(G, -kanOfZeni(cost)); spendLog(G, `${d.name}${n}人`, kanOfZeni(cost)); chokuAdd(G, kind, n);
      done(`${d.name}を${n}人雇った（直属兵 ${chokuAlive(G)}/${chokuCap(G)}）`);
    });
  };
  const refill = () => {
    const need = chokuNeed(G), p = refillPlan(G, need); if (!need || p.cost > z()) return;
    sure(p.cost, `不足分を一括補充（${need}人）`, () => {
      if (chokuNeed(G) !== need) return;
      addKan(G, -kanOfZeni(p.cost)); spendLog(G, `直属兵の補充${need}人`, kanOfZeni(p.cost));
      chokuAdd(G, 'bow', p.bow); chokuAdd(G, 'spear', p.spear);
      done(`直属兵を${need}人補充した（${chokuAlive(G)}/${chokuCap(G)}）`);
    });
  };
  // 銭を追加：小判から替える。足りなければ「小判が不足しています［小判を購入］［戻る］」
  const addZeni = () => {
    const kb = kobanOf();
    ask('小判を銭に替える', `いまの小判 ${num(kb)}`, [...KOBAN_TO_ZENI.map((x) => [`小判 ${num(x.koban)}<small>銭 ${num(x.zeni)}</small>`, () => {
      if (kobanOf() < x.koban) return short(x.koban - kobanOf());
      kobanToZeni(G, x).then((ok) => { if (ok) done(`小判${num(x.koban)}を銭${num(x.zeni)}に替えた`); else short(x.koban - kobanOf()); });
    }, true]), ['戻る', null]]);
  };
  const short = (need) => ask('小判が不足しています', `あと ${num(need)} 必要です`, [['小判を購入', buyKoban, true], ['戻る', null]]);
  const buyKoban = async () => {
    if (o.buyKoban) return o.buyKoban(() => { if (el.isConnected) draw(); });
    try { const I = await import('./online/index.js'); if (I.openKinShop) return I.openKinShop(() => { if (el.isConnected) draw(); }); } catch (e) { /* 買い場がまだ無い */ }
    toast('小判の購入はアプリで行えます');
  };
  const bind = () => {
    el.querySelectorAll('[data-a]').forEach((b) => b.onclick = () => {
      const a = b.dataset.a;
      if (a === 'close') { sfx('ui'); close(); } else if (a === 'add') { sfx('ui'); addZeni(); } else if (a === 'seen') { G.tonyaSeen = true; save(G); draw(); }
    });
    el.querySelectorAll('[data-tab]').forEach((b) => b.onclick = () => { if (tab === b.dataset.tab) return; tab = b.dataset.tab; sfx('ui'); el.querySelector('.tny-list').scrollTop = 0; draw(); });
    el.querySelectorAll('[data-buy]').forEach((b) => b.onclick = () => { const [k, id] = b.dataset.buy.split(':'); buy(k, id); });
    el.querySelectorAll('[data-eq]').forEach((b) => b.onclick = () => { const [k, id] = b.dataset.eq.split(':'); equip(k, id); });
    el.querySelectorAll('[data-hire]').forEach((b) => b.onclick = () => { const [k, n] = b.dataset.hire.split(':'); hire(k, +n); });
    el.querySelectorAll('[data-refill]').forEach((b) => b.onclick = refill);
  };
  draw();
  el.querySelector('.tny-tabs [aria-selected=true]')?.focus({ preventScroll: true });
  return close;
}

// ---- 出陣の前の支度の一行（hub.js preCard）：主武器・副武器・遠く・鎧・直属兵 と［問屋へ］ ----
let kitG = null;
const kitHorse = (G) => (HORSES[(G.horse || {}).id || 'tsukikage'] || HORSES.tsukikage).name;
// 出陣の前の支度で持ち物を選ぶ（K608 ⑤）：押すたびに持っている物の中で次へ。戦は G.equip（槍・鎧）・G.gunKind（筒）・G.horse（馬）をそのまま使う
const KIT = {
  weapon: (G) => (G.owned || []).filter((x) => ITEMS[x]?.slot === 'weapon'),
  body: (G) => (G.owned || []).filter((x) => ITEMS[x]?.slot === 'body'),
  far: (G) => Object.values(GUN_KINDS).filter((k) => (k.id === 'nami' ? (G.owned || []).includes('teppo') : (G.owned || []).includes(k.item))).map((k) => k.id),
  horse: (G) => (ladderStep(G) >= 2 ? ['tsukikage', ...(G.horses || []).filter((h) => h !== 'tsukikage' && HORSES[h])] : []),
};
const kitText = (G, k) => k === 'weapon' ? (ITEMS[(G.equip || {}).weapon] || {}).name : k === 'body' ? (ITEMS[(G.equip || {}).body] || {}).name : k === 'far' ? (KIT.far(G).length ? gunKindOf(G).name : (G.owned || []).includes('yumi') ? '弓' : '') : k === 'horse' ? kitHorse(G) : '';
if (typeof document !== 'undefined') document.addEventListener('click', (e) => {
  const b = e.target.closest?.('.pc-kit [data-kit]'); const G = kitG; if (!b || !G) return;
  const k = b.dataset.kit, list = KIT[k]?.(G) || []; if (list.length < 2) return;
  const cur = k === 'weapon' ? G.equip.weapon : k === 'body' ? G.equip.body : k === 'far' ? gunKindOf(G).id : (G.horse || {}).id || 'tsukikage';
  const next = list[(list.indexOf(cur) + 1) % list.length];
  if (k === 'weapon') G.equip.weapon = next; else if (k === 'body') G.equip.body = next; else if (k === 'far') G.gunKind = next;
  else G.horse = { ...((G.horseBonds || {})[next] || { id: next, bond: 0 }), id: next };
  save(G); sfx('ui');
  const v = b.querySelector('b'); if (v) v.textContent = kitText(G, k);
});
export function tonyaKitHtml(G) {
  if (!G || G.lord) return '';
  kitG = G;
  const cap = chokuCap(G);
  const cell = (k, label) => { const v = kitText(G, k); if (!v) return ''; const many = (KIT[k]?.(G) || []).length > 1;
    return many ? `<button type="button" data-kit="${k}" style="min-height:44px;padding:0 8px;border:1px solid var(--line,#5a4a32);border-radius:4px;background:transparent;color:inherit;font:inherit" aria-label="${label}を替える"><small style="color:var(--washi-dim,#cbbd9c);margin-right:4px">${label}</small><b style="font-weight:500">${esc(v)}</b> ↻</button>`
      : `<span><small style="color:var(--washi-dim,#cbbd9c);margin-right:4px">${label}</small><b style="font-weight:500">${esc(v)}</b></span>`; };
  const side = (G.owned || []).includes('katana') ? `<span><small style="color:var(--washi-dim,#cbbd9c);margin-right:4px">副武器</small>打刀</span>` : '';
  return `<div class="pc-kit" style="display:flex;flex-wrap:wrap;align-items:center;gap:4px 10px;margin:6px 0;font-size:14px">${cell('weapon', '主武器')}${side}${cell('far', '遠く')}${cell('body', '鎧')}${cell('horse', '馬')}${cap ? `<span><small style="color:var(--washi-dim,#cbbd9c);margin-right:4px">直属兵</small>${chokuAlive(G)}/${cap}</span>` : ''}
    <button type="button" class="btn" id="pc-tonya" style="min-height:44px;margin-left:auto">問屋へ</button></div>`;
}
