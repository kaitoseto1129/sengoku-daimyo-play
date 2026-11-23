// 武将登用の画面（K588・docs/gacha_price_1120.md・online_req 18〜22／100「城・使者・書状。書状三通を開き、三人から一人を登用」・クラウド kaito2 k365-cloud-27・11/21）。
//   openToyo(root, o) で root の上に開く。o：{ state（toyo_rules の newToyoState）, banner（{ pickup, event, name }）, rng, onClose, onSave, buyKin(pack) }
//   本番は抽選と持ち物をサーバー（K589 Cloudflare Workers）が持つ。この画面は toyo_rules.js の関数を呼ぶだけなので、サーバーの返事に替えても形は同じ。
//   売り方の決まり（紙）：売るのはオンラインのホームと、この画面だけ。SS が出なかった後の「あと1回！」は出さない。確率と天井の残りはいつも見える所に置く。
import { PRICE, FREE_DAILY, PITY, PICKUP_AT, PACKS, pull, choose, choosePending, declinePending, pendingSets, creditPurchase, recommend, rateTable, pityLeft, ticketChoices, useTicket } from './toyo_rules.js';
import { BUSHOU_BY_ID, HOUSE_NAME, BUSHOU_ONLINE } from './bushou_online.js';
import { GUARD_NOTE, SEAL_NOTE, GUARD_NOTE_EN, SEAL_NOTE_EN } from './busho_bank.js';
import { armOf as tierArmOf, armsAvailable, housesAvailable, houseNameOf, TIERS, tierOf, pullTier, tierPendingNow, confirmPicks, tierRates, tierPool } from './toyo_tiers.js';
import { isEn, addEn } from '../i18n.js';
import { troopsOf } from './unit_type.js';   // K624⑤：格で率いる兵（N600〜SS2000）
import { buyError } from '../paywall.js';   // K583：買えなかった時は字で知らせる（押しても何も起きないに見えない）

if (isEn()) import('./i18n_toyo.js').then((m) => addEn(m.default)).catch(() => {});
const MARK = { SS: '', S: '', A: '', R: '', N: '' };   // K608（kaito「●■▲の意味が分からない」）：印は使わず、格は字（SS・S・A・R・N）と枠の色で示す
// ---- レアごとの演出の差し込み口（K600：3D全身・専用の登場は別の係が setRevealHook(rank, fn) で差す）
//   fn(card, b, ctx)：card＝開く書状の要素・b＝その武将・ctx＝{ skip（一括・全部スキップ）, root（画面の要素）}。Promise を返せば終わるまで待つ。
//   既定は N・R・A＝演出なし（開く動きだけ）・S・SS＝暗い幕に名と格を出す（タップで飛ばせる・動きを減らす設定では出さない）。
//   見せる格は引いた本当の格だけ（偽の SS 演出は禁止・33）。
const reduceMotion = () => { try { return matchMedia('(prefers-reduced-motion:reduce)').matches; } catch (e) { return false; } };
const stageOf = (ms) => (card, b, ctx) => new Promise((done) => {
  if (ctx.skip || reduceMotion()) return done();
  const st = document.createElement('div'); st.className = `ty-stage r-${b.rank}`; st.setAttribute('role', 'img'); st.setAttribute('aria-label', `${b.rank} ${b.name}`);
  st.innerHTML = `<div class="sg-rk">${MARK[b.rank]} ${b.rank}</div><div class="sg-nm">${esc(b.name)}</div><div class="sg-hs">${HOUSE_NAME[b.house]}家</div><button class="sg-skip" aria-label="飛ばす">▶▶</button>`;
  ctx.root.appendChild(st);
  const end = () => { clearTimeout(t); st.remove(); done(); };
  const t = setTimeout(end, ms); st.onclick = end;
});
export const REVEAL = { N: null, R: null, A: null, S: stageOf(2200), SS: stageOf(3200) };
export function setRevealHook(rank, fn) { REVEAL[rank] = fn; }
// K600（k600-engi）：3D 全身・家の型・SS 専用の登場（toyo_reveal.js）を差す。読めない時は上の既定の幕のまま
import('./toyo_reveal.js').then((R) => R.installReveal(setRevealHook)).catch(() => {});
const reveal = async (card, b, ctx) => { const f = REVEAL[b.rank]; if (f) { try { return await f(card, b, ctx); } catch (e) { /* 演出が落ちても登用は進む */ } } return null; };

// 主兵種（K601 3〜5）：槍・騎馬・鉄砲・弓。表の fav（得意の型）から読む。弓は小早川隆景のように名で決める。率いる兵はその兵種だけ。数は格で N600〜SS2000（K624⑤）
export const armOf = tierArmOf;   // 主兵種は toyo_tiers.js に（兵種登用の絞りと同じ読み方）
const ARM_MARK = { 槍: '│', 騎馬: '♞', 鉄砲: '●', 弓: ')' };
export const armChip = (b) => `<span class="ty-arm" aria-label="兵種 ${armOf(b)}"><i aria-hidden="true">${ARM_MARK[armOf(b)]}</i> <b>${armOf(b)}</b></span>`;
// K606：候補の札（字だけでなく全身・家紋・兵種の印と字・格の枠と色・Cost の札）。tag='div' で押せない札（結果）
// K615：何家の武将かを、家紋と家の名で大きくはっきり出す（紋の絵は house.js の monCanvas を、画面に出た後で入れる）
export const houseTag = (b, cls = '') => `<span class="ty-hse ${cls}" data-hse="${b.house}" aria-label="${HOUSE_NAME[b.house]}"><canvas data-hmon="${b.house}" width="48" height="48" aria-hidden="true"></canvas><b>${HOUSE_NAME[b.house]}${HOUSE_NAME[b.house].endsWith('家') ? '' : '家'}</b></span>`;
export const fillHouse = (root) => { const cs = root.querySelectorAll('canvas[data-hmon]:not([data-done])'); if (!cs.length) return; import('./house.js').then((H) => { for (const c of cs) { c.dataset.done = '1'; try { const m = H.HOUSES.find((h) => h.id === c.dataset.hmon); if (!m) { c.remove(); continue; } if (m) { const k = H.monCanvas(m.mon, 24, 24); c.getContext('2d').drawImage(k, 0, 0, 48, 48); c.parentElement.style.setProperty('--hc', m.color); } } catch (e) { /* 紋が無くても家の名は出る */ } } }).catch(() => {}); };
const candCard = (b, { a = '', attrs = '', sel = false, dim = false, note = '', tag = 'button' } = {}) => `<${tag} class="ty-cc r-${b.rank}${sel ? ' sel' : ''}${dim ? ' dim' : ''}"${a ? ` data-a="${a}"` : ''} ${attrs}${tag === 'button' ? ` aria-pressed="${sel}"` : ''} aria-label="${b.rank} ${esc(b.name)} ${armOf(b)} Cost ${b.cost}${sel ? '（選んだ）' : ''}">
  <span class="cc-rk">${MARK[b.rank]} ${b.rank}</span><canvas class="cc-mon" width="64" height="64" data-cc-mon="${esc(b.name)}" aria-hidden="true"></canvas>
  <span class="cc-bd" data-busho-body="${esc(b.name)}"></span><span class="cc-nm">${esc(b.name)}</span>
  ${houseTag(b, 'cc')}<span class="cc-mt">${armChip(b)}<span class="cc-cost">Cost ${b.cost}</span></span>${note ? `<span class="cc-tag">${note}</span>` : ''}${sel ? '<span class="cc-sel" aria-hidden="true">選</span>' : ''}</${tag}>`;
// K616（原理7：保証は残りを数と棒の両方で）：天井の進みの細い棒
const pbar = (n, of) => `<i class="ty-pbar" aria-hidden="true"><b style="width:${Math.max(0, Math.min(100, (n / (of || 1)) * 100)).toFixed(0)}%"></b></i>`;
const LART = (n = 1) => `<span class="ty-lart${n > 1 ? ' ten' : ''}" aria-hidden="true">${'<i></i>'.repeat(n > 1 ? 3 : 1)}</span>`;
// 有料の登用の札に立たせる武将（その登用で出る一番上の格から二人まで。全身の絵）
const tierFaces = (id) => { const g = tierPool(id)[0]; return id === 'normal' ? [] : (g ? g.list.slice(0, id === 'tokusen' ? 2 : 1).map((b) => b.name) : []); };
const fillCand = (root) => {
  import('../bushou_card_art.js').then((A) => {
    for (const c of root.querySelectorAll('canvas[data-cc-mon]')) { if (c.dataset.done) continue; c.dataset.done = '1'; if (!A.drawCardMon(c, c.dataset.ccMon)) c.remove(); }
    // K624 ⑧：S・SS の札は全身の後ろにその人の大旗（旗印）を立てる
    for (const bd of root.querySelectorAll('.ty-cc.r-S .cc-bd,.ty-cc.r-SS .cc-bd')) {
      if (bd.dataset.flagDone) continue; bd.dataset.flagDone = '1';
      const f = document.createElement('canvas'); f.width = 60; f.height = 150;
      if (A.drawCardFlag(f, bd.dataset.bushoBody)) bd.style.backgroundImage = `url(${f.toDataURL()})`;
    }
  }).catch(() => {});
  import('./toyo_reveal.js').then((R) => R.fillBodies(root)).catch(() => {});
};
const infoLine = (b, tac) => `主兵種 ${armOf(b)}　率いる兵 ${armOf(b)}${troopsOf(b)}　Cost ${b.cost}${tac ? `　戦法 ${tac}` : ''}`;
const KATA_NAME = { std: '標準', yari: '槍', teppo: '鉄砲', kiba: '騎馬', shubi: '守備' };
const RCOL = { SS: '#e8c25a', S: '#d9824a', A: '#8fb0d8', R: '#9fc08a', N: '#b8ae9c' };
const pct = (v) => `${(v * 100).toFixed(v < 0.01 ? 2 : 1)}%`;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export const HOUSE_CSS = `
.ty-hse{display:inline-flex;align-items:center;gap:5px;font-weight:700;color:var(--hc,#e8c77a);white-space:nowrap}.ty-hse canvas{width:24px;height:24px;flex:none;background:#0004;border-radius:50%;padding:1px}
.ty-card .ty-hse,.ty-lt .ty-hse{color:#3a2410}.ty-card .ty-hse canvas,.ty-lt .ty-hse canvas,.ty-cc .ty-hse canvas{background:#2a1d12}.ty-hse.lg{font-size:18px;gap:7px}.ty-hse.ov{position:absolute;left:8px;top:40px;z-index:3;flex-direction:column;gap:3px;background:#000a;border:1px solid var(--hc,#e8c77a);padding:6px 10px;border-radius:4px;font-size:20px;color:#f6ecd0!important}.ty-hse.ov canvas{width:76px;height:76px;background:#f6ecd0!important;box-shadow:0 0 0 2px var(--hc,#e8c77a);padding:3px}.ty-gs{position:absolute;left:8px;top:8px;z-index:3;display:flex;gap:6px;align-items:center}.ty-gk{font:700 18px/1.4 serif;color:#1c1408;background:#e8c25a;padding:0 10px;border-radius:3px}.ty-gk.r-S{background:#d9824a}.ty-gk.r-A{background:#8fb0d8}.ty-gk.r-R{background:#9fc08a}.ty-gk.r-N{background:#b8ae9c}.ty-gs .ty-arm{font-size:15px;color:#f3e2b8;background:#000a;border:1px solid #c9a24a;padding:0 8px;border-radius:3px}.ty-hse.lg canvas{width:34px;height:34px}.ty-hse.sm{font-size:13px}.ty-hse.sm canvas{width:18px;height:18px}
`;
export const ensureHouseCss = () => { if (!document.getElementById('ty-hse-css')) { const e = document.createElement('style'); e.id = 'ty-hse-css'; e.textContent = HOUSE_CSS + '.ty-arm{display:inline-flex;gap:3px;font-weight:700}'; document.head.appendChild(e); } };
const CSS = HOUSE_CSS + `
.ty-cc .ty-hse.cc{font-size:17px;color:#3a2410;background:#fff6;border-radius:3px;padding:0 4px;align-self:stretch;justify-content:center}.ty-cc .ty-hse.cc canvas{width:30px;height:30px}.ty-ov.ten .ty-desk>.ty-cc .ty-hse.cc,.ty-g5>.ty-cc .ty-hse.cc{grid-column:2;grid-row:2;flex-direction:column;gap:1px;align-self:center;white-space:normal;text-align:center;line-height:1.15}.ty-ov.ten .ty-desk>.ty-cc .ty-hse.cc canvas,.ty-g5>.ty-cc .ty-hse.cc canvas{width:32px;height:32px}.ty-cc .ty-hse.cc b{font-size:17px}.ty-ov.ten .ty-desk>.ty-cc .ty-hse.cc b{font-size:14px}.ty-ov.ten .ty-desk>.ty-cc .ty-arm{font-size:13px}.ty-ov.ten .ty-desk>.ty-cc .cc-cost{display:none}
.toyo{position:fixed;inset:0;z-index:9000;color:#f1e9d6;font:15px/1.45 "Noto Serif JP","Hiragino Mincho ProN",serif;background:radial-gradient(ellipse at 50% 35%,#3a2c1c 0%,#15100b 70%);display:flex;flex-direction:column;
  padding:max(8px,env(safe-area-inset-top)) max(16px,env(safe-area-inset-right)) max(8px,env(safe-area-inset-bottom)) max(16px,env(safe-area-inset-left));box-sizing:border-box;overflow:hidden}
.toyo *{box-sizing:border-box}
.toyo button{font:inherit;color:inherit;min-height:44px;cursor:pointer;border-radius:4px}
.ty-top{display:flex;align-items:center;gap:8px;flex:none}
.ty-top h1{margin:0 auto 0 0;font-size:20px;letter-spacing:.2em;color:#e8c77a}
.ty-chip{padding:6px 12px;background:#0007;border:1px solid #8a7350;border-radius:22px;white-space:nowrap}
.ty-x{min-width:44px;background:#0007;border:1px solid #8a7350}
.ty-main{flex:1;display:flex;gap:16px;min-height:0;margin-top:8px}
.ty-left{flex:1;display:flex;flex-direction:column;justify-content:space-between;gap:8px;min-width:0;overflow:auto}
.ty-banner{border:1px solid #b8955a;background:linear-gradient(90deg,#2a1c10ee,#2a1c1066);padding:10px 14px;border-radius:4px}
.ty-banner b{font-size:22px;color:#e8c77a}
.ty-pity{display:flex;flex-wrap:wrap;gap:6px 14px;margin-top:6px;font-size:14px}
.ty-pity span strong{color:#f3d68a;font-size:17px}
.ty-pity span{display:inline-flex;align-items:center;gap:4px}.ty-pbar{display:inline-block;width:72px;height:8px;margin-left:6px;background:#0008;border:1px solid #8a7350;border-radius:4px;overflow:hidden}.ty-pbar b{display:block;height:100%;background:linear-gradient(90deg,#c9a24a,#f3d68a)}
.ty-btns{display:flex;gap:8px;flex-wrap:wrap}
.ty-btn{flex:1;min-width:130px;padding:6px 10px;border:1px solid #e8c77a;background:#5a1f17;text-align:center}
.ty-btn small{display:block;font-size:13px;opacity:.85}
.ty-btn.free{background:#24402a;border-color:#9fc08a}
.ty-btn.free.guide{box-shadow:0 0 0 2px #e8f0c0,0 0 18px 4px #c8e08a99}
@media (prefers-reduced-motion:no-preference){.ty-btn.free.guide{animation:tyGuide 1.6s ease-in-out infinite}@keyframes tyGuide{50%{box-shadow:0 0 0 2px #e8f0c0,0 0 26px 9px #c8e08acc}}}
.ty-btn:disabled,.ty-foot button:disabled{opacity:.45;cursor:default}
/* K608：釦・商品・幕の絵（書状・小判・武将の全身・旗。ゲームの3Dから撮った全身は [data-busho-body]） */
.ty-btn{display:flex;align-items:center;justify-content:center;gap:10px}.ty-btn>span{display:flex;flex-direction:column}
.ty-lt.opened .op{border:3px solid var(--rc,#b8ae9c)}.ty-lt.r-SS{--rc:#e8c25a}.ty-lt.r-S{--rc:#d9824a}.ty-lt.r-A{--rc:#8fb0d8}.ty-lt.r-R{--rc:#9fc08a}.ty-lt.r-N{--rc:#b8ae9c}
.ty-lt.opened .op .rk{background:var(--rc);border-color:var(--rc);color:#1c1408!important}
.ty-lart{display:inline-block;position:relative;width:38px;height:50px;flex:none}
.ty-lart i{position:absolute;inset:0;background:linear-gradient(135deg,#f6ecd0,#d9c49a);border:1px solid #8a6a3a;box-shadow:0 2px 4px #0009}
.ty-lart i::before{content:'';position:absolute;left:0;right:0;top:40%;height:9px;background:#e8dcc0;border-top:1px solid #a88a5a;border-bottom:1px solid #a88a5a}
.ty-lart i::after{content:'';position:absolute;left:50%;top:44%;width:14px;height:14px;margin:-5px 0 0 -7px;border-radius:50%;background:#a8281c;box-shadow:0 0 0 2px #e8c25a66}
.ty-lart.ten{width:56px}.ty-lart.ten i{width:38px}.ty-lart.ten i:nth-child(1){transform:rotate(-14deg);left:0}.ty-lart.ten i:nth-child(2){left:9px}.ty-lart.ten i:nth-child(3){transform:rotate(14deg);left:18px}
.ty-tier{display:flex;align-items:center;gap:8px}.ty-tier>span:first-child{flex:1;min-width:0}
.ty-tpic{display:flex;align-items:flex-end;gap:0;height:62px;flex:none}.ty-tpic>span{display:block;width:40px;height:62px;overflow:hidden}.ty-tpic>span img{width:100%;height:100%!important;max-height:none!important;object-fit:cover;transform:scale(1.7);transform-origin:50% 42%}
.ty-tier b{white-space:normal}.ty-tier .ty-lart{width:30px;height:40px}.ty-tier .ty-lart.ten{width:44px}.ty-tier .ty-lart.ten i{width:30px}
.ty-banner{position:relative;overflow:hidden;flex:none}
@media (max-height:440px){.ty-banner .ty-use{display:none}.ty-banner{padding:6px 12px}.ty-btn{padding:2px 10px}.ty-btn .ty-lart{width:30px;height:40px}.ty-btn .ty-lart.ten{width:44px}.ty-btn .ty-lart.ten i{width:30px}.ty-tier{padding:4px 10px}.ty-tpic,.ty-tpic>span{height:50px}.ty-tier small{font-size:12px;line-height:1.3}.ty-main{margin-top:4px}}.ty-banner>*{position:relative;z-index:1}
.ty-banner .ty-bmon{position:absolute;right:-14px;top:50%;width:120px;height:120px;transform:translateY(-50%);opacity:.22;z-index:0;pointer-events:none}
.ty-banner .ty-bflag{position:absolute;right:96px;top:6px;width:22px;height:56px;z-index:0;box-shadow:0 1px 3px #000a;pointer-events:none}
.ty-koban{display:flex;gap:2px;margin-bottom:4px}.ty-koban i{display:block;width:18px;height:26px;border-radius:50%;background:radial-gradient(ellipse at 40% 35%,#fff3b8,#e2b23c 45%,#9a7016);box-shadow:inset 0 0 0 1px #6a4a0a,0 1px 2px #000a}
.ty-packs .bd{display:block;height:84px;overflow:hidden}.ty-packs .bd img{height:100%;max-height:none!important}
.ty-sub{display:flex;gap:8px}
.ty-sub button{flex:1;background:#0007;border:1px solid #8a7350;padding:4px 10px}
.ty-right{width:min(38%,300px);display:flex;flex-direction:column;gap:8px;min-height:0}
.ty-feat{flex:1;min-height:140px;position:relative;border:1px solid #6a5a3a;border-radius:4px;overflow:hidden;background:#0006;touch-action:pan-y}
.ty-feat .fd{position:absolute;right:6px;bottom:6px;min-height:44px;padding:4px 12px;background:#000b;border:1px solid #8a7350;color:inherit;font:inherit;border-radius:4px;z-index:2}
.ty-feat .fn{position:absolute;left:8px;top:6px;z-index:2;text-shadow:0 1px 4px #000;font-size:15px;pointer-events:none}
.ty-tk{border:1px solid #8a7350;background:#0006;padding:8px 10px;border-radius:4px;font-size:14px}
.ty-tk button{width:100%;margin-top:6px;background:#3b2a16;border:1px solid #e8c77a}
.ty-ov{position:absolute;inset:0;background:#0b0806f2;display:flex;flex-direction:column;padding:inherit;z-index:2}
.ty-ov h2{margin:0;font-size:18px;color:#e8c77a}
.ty-cards{flex:1;display:flex;gap:12px;align-items:stretch;justify-content:center;min-height:0;margin:10px 0}
.toyo .ty-card{flex:1 1 0;min-width:0;max-width:230px;position:relative;border:1px solid #b8955a;background:linear-gradient(#efe4c8,#d9c9a2);color:#2a1d12;border-radius:3px;padding:10px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;text-align:center}
.ty-card .rk{font:700 22px/1 serif;letter-spacing:.05em}
.ty-card .nm{font-size:24px;font-weight:700;writing-mode:vertical-rl;letter-spacing:.15em;min-height:5.2em}
.ty-card .hs{font-size:14px}
.ty-card.sealed{background:linear-gradient(#e9dcbc,#cdb98d)}
.ty-card.sealed .nm{opacity:0}
.ty-card .seal{position:absolute;inset:auto 0 46% 0;font-size:16px;color:#7a2a1a}
.ty-card.pick{outline:3px solid #e8c77a;outline-offset:2px}
.ty-card.left{opacity:.45}
.ty-card .tag{font-size:13px;color:#7a2a1a}
/* K600 17〜25：城内の書院・机の上の三通の書状（一通ずつ開く）・開いた書状に全身・家紋・名・格・型の一行（三人とも違う全身の3D） */
.ty-ov.jo{background:linear-gradient(180deg,#0b0806 0,#1a130c 8%,transparent 9%),linear-gradient(90deg,#3a2a18 0 10px,#0000 10px calc(100% - 10px),#3a2a18 0),repeating-linear-gradient(90deg,#0000 0 70px,#4a3622 70px 72px),repeating-linear-gradient(0deg,#e6dcc2 0 52px,#6a5236 52px 53px);background-color:#e2d6ba}
.ty-ov.jo::before{content:"";position:absolute;inset:0;background:radial-gradient(ellipse at 50% 40%,#0000 0,#000a 70%),linear-gradient(#0008,#0003 40%,#0000 55%);pointer-events:none}
.ty-ov.jo::after{content:"";position:absolute;left:0;right:0;bottom:0;height:46%;background:linear-gradient(#5a3a20,#3a2414 12%,#2a190d);border-top:3px solid #7a5432;box-shadow:0 -6px 18px #0009 inset;pointer-events:none}
.ty-ov.jo>*{position:relative;z-index:1}
.ty-ov.jo h2{text-shadow:0 1px 4px #000}
.ty-ov.jo .ty-note{color:#f1e9d6;text-shadow:0 1px 3px #000}
.ty-desk{flex:1;display:flex;gap:10px;align-items:flex-end;justify-content:center;min-height:0;margin:6px 0 4px}
.toyo .ty-lt{flex:1 1 0;min-width:0;max-width:280px;height:100%;position:relative;border:0;padding:0;background:none;color:#2a1d12;display:flex;align-items:flex-end;justify-content:center}
.ty-lt .fold{width:min(100%,190px);height:min(62%,130px);background:linear-gradient(135deg,#f3ead4,#dccba4);border:1px solid #a8885a;box-shadow:0 8px 14px #000a,0 1px 0 #fff8 inset;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;transform:rotate(-1.5deg);margin-bottom:10%}
.ty-lt:nth-child(2) .fold{transform:rotate(1deg)}.ty-lt:nth-child(3) .fold{transform:rotate(-.5deg)}
.ty-lt .fold .ti{font-size:18px;letter-spacing:.3em}
.ty-lt .fold .fu{width:34px;height:34px;border-radius:50%;background:#8a2418;color:#f3e2c0;font:700 16px/34px serif;text-align:center;box-shadow:0 1px 2px #0008}
.ty-lt.aura .fold{background:linear-gradient(135deg,#f6ecd0,#e3c98a);border:2px solid #c9a24a;box-shadow:0 0 0 2px #5a3a10,0 0 22px 4px #e8c25a88,0 8px 14px #000a}
.ty-lt.aura .fold .fu{background:#1c1a1a;color:#e8c25a;border:2px solid #c9a24a}
@media (prefers-reduced-motion:no-preference){.ty-lt.aura .fold{animation:tyAura 2.4s ease-in-out infinite}@keyframes tyAura{50%{box-shadow:0 0 0 2px #5a3a10,0 0 30px 8px #e8c25acc,0 8px 14px #000a}}}
/* K617（ガチャから借りた原理：前触れは段で・嘘をつかない）：書状の封は、中の武将の格そのまま。並（R・N）＝朱の封・A＝銀の縁・S＝金の紋・SS＝五色の紐の紋。開く前の封が違う格を示す事は無い */
.ty-lt.sl-A .fold{border:2px solid #b8c4d0;box-shadow:0 0 0 1px #4a5560,0 0 10px 1px #c8d4e088,0 8px 14px #000a}.ty-lt.sl-A .fold .fu{background:#5a6470}
.ty-lt.sl-S .fold,.ty-lt.sl-SS .fold{background:linear-gradient(135deg,#f6ecd0,#e3c98a);border:2px solid #c9a24a;box-shadow:0 0 0 2px #5a3a10,0 0 22px 4px #e8c25a88,0 8px 14px #000a}
.ty-lt.sl-S .fold .fu{background:#1c1a1a;color:#e8c25a;border:2px solid #c9a24a}
.ty-lt.sl-SS .fold{border:3px solid transparent;background:linear-gradient(135deg,#f8efd6,#e8cf92) padding-box,conic-gradient(#e8c25a,#d9824a,#b8342a,#6a3a8a,#2e5a9a,#3a7a4a,#e8c25a) border-box;box-shadow:0 0 0 1px #5a3a10,0 0 30px 8px #f3d68aaa,0 8px 14px #000a}
.ty-lt.sl-SS .fold .fu{background:conic-gradient(#e8c25a,#d9824a,#b8342a,#6a3a8a,#2e5a9a,#3a7a4a,#e8c25a);color:#fff;text-shadow:0 1px 2px #000;border:2px solid #fff8}
@media (prefers-reduced-motion:no-preference){.ty-lt.sl-SS .fold{animation:tySS 1.8s ease-in-out infinite}@keyframes tySS{50%{box-shadow:0 0 0 1px #5a3a10,0 0 40px 14px #fff0c0cc,0 8px 14px #000a;transform:translateY(-2px)}}}
.ty-lt .op{width:100%;height:100%;background:linear-gradient(#f1e7cf,#ddcca6);border:1px solid #a8885a;box-shadow:0 8px 16px #000b;display:flex;gap:4px;padding:6px;text-align:left}
.ty-lt .op .bd{flex:0 0 46%;display:flex;align-items:flex-end;justify-content:center;background:radial-gradient(ellipse at 50% 70%,#fff6 0,#0000 70%);overflow:hidden;min-height:0}
.ty-lt .op .bd img{height:100%;max-height:none!important}
.ty-lt .op .in{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px;justify-content:center}
.ty-lt .op .ty-hse.lg{flex-direction:column;align-items:flex-start;gap:1px;font-size:19px;line-height:1.1;white-space:normal}.ty-lt .op .ty-hse.lg canvas{width:46px;height:46px;padding:2px;box-shadow:0 0 0 2px var(--hc,#e8c77a)}.ty-lt .op .hs .ty-arm{font-size:16px}.ty-lt .op .rk{align-self:flex-start;font:700 17px/1.25 serif;padding:1px 8px;border:2px solid currentColor;background:#fff8}
.ty-lt .op .nm{font-size:14px;font-weight:700;letter-spacing:.06em;line-height:1.2;word-break:keep-all}
.ty-lt .op .hs{font-size:13px}
.ty-lt .op .ka{font-size:13px;color:#5a2a14;line-height:1.35}
.ty-lt .op .tag{font-size:12px;color:#7a2a1a}
.ty-ov.ten .ty-desk{flex-wrap:wrap;align-content:flex-end;gap:6px}
.ty-ov.ten .ty-lt{flex:0 0 calc(20% - 6px);height:calc(50% - 4px);max-width:none}
.ty-ov.ten .ty-lt .fold{width:92%;height:70%;margin-bottom:4%}
.ty-ov.ten .ty-lt .fold .ti{font-size:14px;letter-spacing:.15em}.ty-ov.ten .ty-lt .fold .fu{width:26px;height:26px;font-size:13px;line-height:26px}
.ty-ov.ten .ty-lt .op{flex-direction:column;padding:3px;gap:1px;text-align:center}
.ty-ov.ten .ty-lt .op .bd{flex:1 1 auto;min-height:0}
.ty-ov.ten .ty-lt .op .in{flex:none;gap:0;align-items:center}
.ty-ov.ten .ty-lt .op .rk{align-self:center;font-size:12px;padding:0 6px}
.ty-ov.ten .ty-lt .op .nm{font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
.ty-ov.ten .ty-lt .op .hs{font-size:11px}
.ty-lt.taken .op{outline:3px solid #e8c77a;outline-offset:-3px}
/* K606：候補の札（全身・家紋・兵種の印と字・格の枠と色・Cost）。十通・十回登用・候補の一覧・結果で同じ札 */
.toyo .ty-cc{position:relative;display:flex;flex-direction:column;align-items:center;gap:1px;padding:0 0 4px;background:linear-gradient(#f1e7cf,#d9c9a2);color:#2a1d12;border:3px solid var(--rc,#b8ae9c);border-radius:5px;overflow:hidden;min-width:0;min-height:44px;font:inherit;cursor:pointer;text-align:center}
.ty-cc.r-SS{--rc:#e8c25a;box-shadow:0 0 0 1px #5a3a10,0 0 14px #e8c25a99}.ty-cc.r-S{--rc:#d9824a}.ty-cc.r-A{--rc:#8fb0d8}.ty-cc.r-R{--rc:#9fc08a}.ty-cc.r-N{--rc:#b8ae9c}
/* K624 ⑧（kaito「R と SS の違いが見て分からない」）：格ごとに段違い。N＝薄い紙・細い灰の枠／R＝緑の枠／A＝青の枠と地紋／S＝金茶の太い枠・金箔の地・家紋に金の輪・背に大旗／SS＝金の太い枠が光る・黒漆に金砂子の地・家紋に金の輪・背に大旗と軍勢 */
.ty-cc.r-N{border-width:2px;background:linear-gradient(#ece4d2,#d8cdb4)}
.ty-cc.r-A{background:repeating-linear-gradient(45deg,#0000 0 9px,#8fb0d81c 9px 10px),repeating-linear-gradient(-45deg,#0000 0 9px,#8fb0d81c 9px 10px),linear-gradient(#f1e7cf,#d9c9a2)}
.ty-cc.r-S{border-width:3px;border-color:#a8602a;background:linear-gradient(135deg,#efdcc0,#d9b48a 60%,#c08e5a);box-shadow:0 0 0 1px #4a2008}   /* K633 ②：S は銅と朱の落ち着いた札（SS より下に見える） */
.ty-cc.r-SS{border:5px solid transparent;background:radial-gradient(circle,#fff8 0 1px,#0000 1.6px) 0 0/23px 19px,radial-gradient(circle,#fff3c0aa 0 1px,#0000 1.5px) 9px 7px/31px 27px,linear-gradient(135deg,#fff3c0,#f3d68a 30%,#e0b04a 60%,#fff0b8) padding-box,conic-gradient(from 0deg,#e8c25a,#d9824a,#b8342a,#6a3a8a,#2e5a9a,#3a7a4a,#e8c25a) border-box;color:#2a1a08;box-shadow:0 0 0 1px #5a3a10,0 0 22px 6px #fff0c0cc}   /* K633 ②：SS は金箔の地に五色の枠（書状の五色の封と同じ）・強く光る */
.ty-cc.r-SS .cc-rk{background:conic-gradient(from 90deg at 50% 50%,#e8c25a,#d9824a,#b8342a,#6a3a8a,#2e5a9a,#3a7a4a,#e8c25a);color:#fff;text-shadow:0 1px 2px #000;font-size:15px;letter-spacing:.14em}
.ty-cc.r-SS .cc-nm{color:#2a1408;font-size:16px;text-shadow:0 1px 0 #fff8}.ty-cc.r-SS .cc-tag{color:#7a2a1a}
.ty-cc.r-S .cc-mon,.ty-cc.r-SS .cc-mon{border-radius:50%;background:#f6ecd0;box-shadow:0 0 0 2px #e8c25a,0 0 8px #f3d68a;padding:2px}
.ty-cc.r-S .cc-bd,.ty-cc.r-SS .cc-bd{background-repeat:no-repeat;background-position:62% 8%;background-size:auto 70%}
.ty-cc.r-SS .cc-bd{background-color:transparent}
.ty-cc.r-SS .cc-bd::before{content:'';position:absolute;left:0;right:0;bottom:0;height:46%;pointer-events:none;opacity:.55;background:repeating-linear-gradient(90deg,#0000 0 7px,#6a1a12 7px 9px,#0000 9px 16px) 0 0/100% 70% no-repeat,repeating-linear-gradient(90deg,#3a2a1a 0 3px,#0000 3px 6px) 0 100%/100% 45% no-repeat}
.ty-cc .cc-bd{position:relative}.ty-cc .cc-bd img{position:relative;z-index:1}
@media (prefers-reduced-motion:no-preference){.ty-cc.r-SS{animation:tyCcSS 2.6s ease-in-out infinite}@keyframes tyCcSS{50%{box-shadow:0 0 0 1px #5a3a10,0 0 34px 12px #fff4ccee}}}
.ty-cc .cc-rk{align-self:stretch;background:var(--rc);color:#1c1408;font:700 13px/1.6 serif;text-align:left;padding:0 6px;flex:none}
.ty-cc .cc-mon{position:absolute;right:3px;top:24px;width:26px;height:26px}
.ty-cc .cc-bd{flex:1 1 auto;min-height:0;width:100%;display:flex;align-items:flex-end;justify-content:center;overflow:hidden;background:radial-gradient(ellipse at 50% 75%,#fff7 0,#0000 70%)}
.ty-cc .cc-bd img{height:100%;max-height:none!important}
.ty-cc .cc-nm{flex:none;font-weight:700;font-size:15px;line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;padding:0 3px}
.ty-cc .cc-mt{flex:none;display:flex;gap:4px;align-items:center;flex-wrap:wrap;justify-content:center}
.ty-cc .ty-arm{font-size:14px;padding:0 5px;border-color:#8a6a3a}
.ty-cc .cc-cost{font-size:12px;padding:0 5px;background:#2a1c10;color:#f3d68a;border-radius:3px;white-space:nowrap}
.ty-cc .cc-tag{flex:none;font-size:12px;color:#7a2a1a;line-height:1.2}
.ty-cc.sel{outline:4px solid #c0392b;outline-offset:-1px}.ty-cc.dim{opacity:.5}
.ty-cc .cc-sel{position:absolute;left:4px;top:26px;width:30px;height:30px;border-radius:50%;background:#c0392b;color:#fff;font:700 17px/30px serif;box-shadow:0 1px 3px #000a}
.ty-ov.ten .ty-desk>.ty-cc{flex:0 0 calc(20% - 6px);height:calc(50% - 4px)}
.ty-ov.ten .ty-desk>.ty-cc,.ty-g5>.ty-cc{display:grid;grid-template-columns:44% 1fr;grid-template-rows:auto 1fr auto auto auto;column-gap:2px;align-items:center}
.ty-ov.ten .ty-desk>.ty-cc .cc-rk,.ty-g5>.ty-cc .cc-rk{grid-column:1 / 3}
.ty-ov.ten .ty-desk>.ty-cc .cc-bd,.ty-g5>.ty-cc .cc-bd{grid-column:1;grid-row:2 / 6;height:100%}
.ty-ov.ten .ty-desk>.ty-cc .cc-bd img,.ty-g5>.ty-cc .cc-bd img{height:122%;margin-bottom:-6%}
.ty-ov.ten .ty-desk>.ty-cc .cc-nm,.ty-g5>.ty-cc .cc-nm{grid-column:2;grid-row:4;white-space:nowrap;font-size:11px;text-overflow:ellipsis}
.ty-ov.ten .ty-desk>.ty-cc .cc-mt,.ty-g5>.ty-cc .cc-mt{grid-column:2;grid-row:3;flex-direction:column;gap:2px}
.ty-ov.ten .ty-desk>.ty-cc .cc-tag,.ty-g5>.ty-cc .cc-tag{grid-column:2;grid-row:5}
.ty-ov.ten .ty-desk>.ty-cc .cc-mon,.ty-g5>.ty-cc .cc-mon{display:none}
.ty-cc .cc-bd img{height:118%;margin-bottom:-5%}
.ty-g5{flex:1;min-height:0;display:grid;grid-template-columns:repeat(5,1fr);grid-template-rows:repeat(2,minmax(0,1fr));gap:6px;margin:6px 0}
@media (max-width:560px){.ty-g5{grid-template-columns:repeat(2,1fr);grid-template-rows:none;grid-auto-rows:190px;overflow:auto}}
.ty-pk{font-size:15px;color:#f3d68a}
.ty-bonus{font-size:15px;color:#1c1408;background:linear-gradient(#f3d68a,#c9a24a);padding:1px 10px;border-radius:3px}
.ty-ov.hiroma{background:linear-gradient(180deg,#0b0806 0,#2a1a08 8%,transparent 9%),repeating-linear-gradient(90deg,#c9a24a 0 2px,#0000 2px 96px),linear-gradient(#e0bc62,#a8803a 55%,#5a4218);background-color:#c9a24a}
.ty-ov.hiroma::after{background:linear-gradient(#4a3a20,#2a2010 14%,#1a140a)}
.ty-ov.jo>.ty-hb{position:absolute;top:10%;bottom:44%;display:flex;gap:14px;z-index:0}.ty-ov.jo>.ty-hb.l{left:4%}.ty-ov.jo>.ty-hb.r{right:4%}
.ty-hb canvas{width:34px;height:92px;align-self:flex-start;box-shadow:0 2px 6px #000a}
.ty-lt.r-SS .op{border:2px solid #c9a24a;box-shadow:0 0 0 2px #5a3a10,0 8px 16px #000b}.ty-lt.r-S .op{border:2px solid #b8703a}
.ty-foot{display:flex;gap:8px;justify-content:center;flex:none}
.ty-foot button{min-width:150px;padding:6px 16px;background:#5a1f17;border:1px solid #e8c77a}
.ty-foot button.sec{background:#0007;border-color:#8a7350}
.ty-tbl{width:100%;border-collapse:collapse;font-size:14px}
.ty-tbl td,.ty-tbl th{border-bottom:1px solid #5a4a32;padding:4px 6px;text-align:left}
.ty-scroll{flex:1;overflow:auto;min-height:0;margin:8px 0}
.ty-packs{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px}
.ty-packs button{background:#2a1c10;border:1px solid #8a7350;padding:8px;text-align:left}
.ty-packs button.best{border-color:#e8c77a;background:#4a2a14}
.ty-packs button.quiet{opacity:.7}
.ty-packs button:disabled{opacity:.45;cursor:default}
.ty-legal{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0}
.ty-legal button{background:#0007;border:1px solid #8a7350;padding:4px 12px;font-size:14px}
.ty-dots{display:inline-flex;gap:4px;vertical-align:middle;margin-right:6px}.ty-dots i{width:10px;height:10px;border-radius:50%;border:1px solid #c9d8a8;display:inline-block}.ty-dots i.on{background:#c8e08a}
.ty-use{color:#f3d68a;opacity:1}.ty-out{border:1px solid #8a7350;background:#0006;padding:8px 10px;border-radius:4px}
.ty-stage{position:absolute;inset:0;z-index:5;background:radial-gradient(ellipse at 50% 60%,#2a1c10f0,#050302);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;cursor:pointer}
.ty-stage .sg-rk{font:700 26px/1 serif;color:#e8c77a;letter-spacing:.1em}.ty-stage .sg-nm{font:700 40px/1.2 "Noto Serif JP",serif;letter-spacing:.2em}.ty-stage .sg-hs{opacity:.8}
.ty-stage.r-SS .sg-rk{font-size:34px;color:#ffe29a}.ty-stage .sg-skip{position:absolute;right:12px;bottom:10px;min-width:44px;background:#0007;border:1px solid #8a7350}
@media (prefers-reduced-motion:no-preference){.ty-stage{animation:tyFade .5s ease-out}@keyframes tyFade{from{opacity:0}to{opacity:1}}.ty-card.aura{animation:tyAura 2s ease-in-out infinite}@keyframes tyAura{50%{box-shadow:0 0 18px 4px #e8c77acc}}}
.ty-card.aura{border-color:#e8c77a}
.toyo .ty-card.open{justify-content:space-between;gap:2px;padding:6px}
.ty-card .rk{font-size:30px}.ty-card .nm{font-size:20px;min-height:0;writing-mode:horizontal-tb;letter-spacing:.1em}
.ty-arm i{font-style:normal}.ty-arm b{font-weight:400}.ty-arm{font-size:14px;padding:0 8px;border:1px solid #6a5232;border-radius:10px;background:#0002;white-space:nowrap}
.ty-card .ty-body{flex:1;min-height:0;width:100%;display:flex;align-items:center;justify-content:center;overflow:hidden}
.ty-lt .pickb{display:block;margin-top:4px;min-height:44px;line-height:44px;text-align:center;background:#5a1f17;color:#f1e9d6;border:1px solid #e8c77a;border-radius:4px;font-size:15px}
.toyo .ty-card button.pickb{width:100%;min-height:44px;background:#5a1f17;color:#f1e9d6;border:1px solid #e8c77a;font-size:15px}
.ty-rows{display:flex;flex-direction:column;gap:6px}.ty-row{display:flex;align-items:center;gap:6px}.ty-row>span{width:2em;text-align:right;opacity:.8}
.ty-row button{flex:1;min-width:0;background:#2a1c10;border:1px solid #8a7350;padding:4px 6px;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ty-row button.hi{border-color:#e8c77a;background:#4a2a14}.ty-row button.pk{outline:3px solid #e8c77a}
.ty-focus{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}.ty-focus button{min-height:44px;padding:2px 10px;background:#0007;border:1px solid #8a7350;font-size:14px}.ty-focus button.on{border-color:#e8c77a;background:#4a2a14}
.ty-detail dt{opacity:.75;font-size:13px}.ty-detail dd{margin:0 0 6px;font-size:15px}
.ty-tiers.g{display:grid;grid-template-columns:repeat(5,1fr);gap:6px}.ty-tiers.g .ty-tier{flex-direction:column;justify-content:center;text-align:center;gap:2px;padding:6px 4px;min-height:44px}.ty-tiers.g .ty-tier b{font-size:15px}.ty-tiers.g .ty-arm{flex:none}.ty-tiers{display:flex;gap:6px}.ty-tiers .ty-tier{flex:1 1 0;min-width:0}
.ty-tier{text-align:left;padding:6px 12px;background:#2a1c10;border:1px solid #b8955a}.ty-tier b{display:block;font-size:14px;color:#e8c77a;white-space:normal}.ty-tier small{display:block;font-size:13px;opacity:.9}.ty-tier .ty-tc{font-size:13px;opacity:.95}.ty-tier small{line-height:1.25}
.ty-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}
.ty-grid.c3{grid-template-columns:repeat(3,1fr)}
.toyo .ty-tc{display:grid;grid-template-columns:64px 1fr;gap:2px 8px;align-items:center;text-align:left;padding:4px 8px;background:linear-gradient(#efe4c8,#d9c9a2);color:#2a1d12;border:1px solid #b8955a;min-height:76px}
.ty-tc .bd{grid-row:1 / span 3;width:64px;height:72px;overflow:hidden}.ty-tc .rk{font:700 18px/1 serif}.ty-tc .nm{font-weight:700;font-size:16px}.ty-tc .mt{font-size:13px}
.ty-tc.sel{outline:3px solid #c0392b;outline-offset:1px}.ty-tc.hi{border-color:#8a5a08;background:linear-gradient(#f6e8c0,#e2c987)}
.ty-note{font-size:13px;opacity:.85;margin:4px 0}
@media (prefers-reduced-motion:no-preference){.ty-card.open{animation:tyOpen .45s ease-out}@keyframes tyOpen{from{transform:rotateY(90deg)}to{transform:none}}}
`;

export function openToyo(root, o) {
  const st = o.state, banner = o.banner || {}, rng = o.rng || Math.random;
  if (!document.getElementById('toyo-css')) { const s = document.createElement('style'); s.id = 'toyo-css'; s.textContent = CSS; document.head.appendChild(s); }
  const el = document.createElement('div'); el.className = 'toyo'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', '武将登用ガチャ');
  root.appendChild(el);
  { let q = false; new MutationObserver(() => { if (q) return; q = true; Promise.resolve().then(() => { q = false; fillHouse(el); }); }).observe(el, { childList: true, subtree: true }); }   // K615：家紋の絵は、画面が替わるたびに入れる
  const save = () => { try { o.onSave && o.onSave(st); } catch (e) { /* 持てなくても画面は進む */ } };
  import('./toyo_reveal.js').then((R) => R.prewarmReveal()).catch(() => {});   // K600：登場の 3D の素材を先に読む（書状を開いてから待たない）
  if (st.target && (banner.focus || []).includes(st.target)) banner.pickup = st.target;
  let pick = banner.pickup ? BUSHOU_BY_ID[banner.pickup] : null;
  // 11/21 K586（cloud-38）：武将の顔を裏で先に撮って端末に残す（SS から順に。一度撮れば次から撮らない）。書状を開いて1秒内に顔を出すため
  import('../busho_portrait.js').then((M) => { M.addPortraitRows(BUSHOU_ONLINE.map((b) => [b.name, b.house])); return M; }).then((M) => M.portraitPrewarm(BUSHOU_ONLINE.slice().sort((a, b) => 'SSANR'.indexOf(a.rank) - 'SSANR'.indexOf(b.rank)).map((b) => b.name))).catch(() => {});

  const left5 = () => { const n = Math.max(0, st.free | 0); return `<span class="ty-dots" role="img" aria-label="無料の登用 残り${n}回">${Array.from({ length: FREE_DAILY }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</span>`; };
  const web = !!o.webFree;   // web の版（購入の口が無い）：登用は無料で何回でも。小判も無料の回数も天井も減らさない
  // K612（11/21 長・アプリの版）：App Store Connect に小判の品が無い（店は答えたが品が無い＝'missing'）時は、小判を買う［＋］と上級・特選を出さない。
  //   無料登用・通常登用（登城帳・務めで得た小判）・武将印の交換で遊べる。品が届けば（risshin-kin-prices）描き直して出す
  const noShop = () => !web && !!o.kinState && PACKS.every((p) => o.kinState(p.id) === 'missing');
  let feat = null, featB = null;
  const featOff = () => { feat?.dispose(); feat = null; };
  const home = () => {
    const pl = pityLeft(st, banner), tk = st.tickets;
    const tks = [['sSelect', 'S 以上の選択券'], ['ssSelect', 'SS の選択券'], ['ssRandom', 'SS 確定券'], ['pickup', `${pick ? pick.name : ''}の確定券`]].filter(([k]) => tk[k] > 0);
    const out = st.free <= 0;
    el.innerHTML = `
      <div class="ty-top"><h1>武将登用ガチャ</h1>
        ${web ? '' : `<span class="ty-chip">小判 ${st.kin.toLocaleString('ja-JP')}</span>
        ${noShop() ? '' : '<button class="ty-x" data-a="kin" aria-label="小判を購入">＋</button>'}`}<button class="ty-x" data-a="close" aria-label="閉じる">✕</button></div>
      ${(o.banners || []).length > 1 && o.onBanner ? `<div class="ty-focus" role="group" aria-label="登用の種類">${o.banners.map((x) => `<button data-a="bn" data-id="${esc(x.id)}" class="${x.id === banner.id ? 'on' : ''}" aria-pressed="${x.id === banner.id}">${esc(isEn() && x.en ? x.en : x.name)}</button>`).join('')}</div>` : ''}
      <div class="ty-main"><div class="ty-left">
        <div class="ty-banner">${pick ? `<canvas class="ty-bmon" width="128" height="128" data-ty-mon="${esc(pick.name)}" aria-hidden="true"></canvas><canvas class="ty-bflag" width="44" height="112" data-ty-flag="${esc(pick.name)}" aria-hidden="true"></canvas><div>${banner.name ? `${esc(isEn() && banner.en ? banner.en : banner.name)}${banner.until && banner.until.label ? `　<span>${esc(banner.until.label)}</span>` : ''}` : '登用の頼み状'}</div><b>${esc(pick.name)}</b>　<span>${MARK[pick.rank]} ${pick.rank}</span><span>・${HOUSE_NAME[pick.house]}</span>` : '<b>武将登用</b>'}
          <div class="ty-pity"${web ? ' hidden' : ''}>
            ${pick ? `<span>${esc(pick.name)}確定まで 残り <strong>${pl.pickupLeft}</strong>回${pbar(PICKUP_AT - pl.pickupLeft, PICKUP_AT)}</span>` : ''}
            <span>${st.pity < 80 ? 'SS確定まで' : `${pl.next.label}まで`} <strong>${st.pity}/${st.pity < 80 ? 80 : pl.next.at}</strong>${pbar(st.pity, st.pity < 80 ? 80 : pl.next.at)}</span>
          </div>
          ${(banner.focus || []).length > 1 ? `<div class="ty-focus" role="group" aria-label="目当ての武将">${banner.focus.map((id) => `<button data-a="focus" data-id="${id}" class="${id === banner.pickup ? 'on' : ''}" aria-pressed="${id === banner.pickup}">${esc(BUSHOU_BY_ID[id].name)}</button>`).join('')}</div>` : ''}
          <div class="ty-note ty-use">登用した武将はオンライン対戦で使用します</div>${banner.next ? `<div class="ty-note ty-next">${esc(isEn() && banner.nextEn ? banner.nextEn : banner.next)}</div>` : ''}</div>
        ${web ? `<div class="ty-btns"><button class="ty-btn free guide" data-a="wone">${LART(1)}<span>登用する<small>web 版は無料で登用できます</small></span></button><button class="ty-btn" data-a="wten">${LART(10)}<span>十回登用<small>無料</small></span></button></div>` : `<div class="ty-btns">
          <button class="ty-btn free${st.free > 0 && !(st.log || []).length ? ' guide' : ''}" data-a="free" ${out ? 'disabled' : ''}>${LART(1)}<span>無料で登用<small>${left5()} 今日の残り ${st.free}回</small></span></button>
        </div>
        <div class="ty-tiers" role="group" aria-label="有料の登用">${TIERS.filter((t) => t.id === 'normal' || !noShop()).map((t) => `<button class="ty-tier" data-a="tier" data-id="${t.id}"><span><b>${t.name}</b><b class="ty-tc">小判 ${t.cost.toLocaleString('ja-JP')}</b><small>${t.line}</small></span><span class="ty-tpic" aria-hidden="true">${tierFaces(t.id).length ? tierFaces(t.id).map((n) => `<span data-busho-body="${esc(n)}"></span>`).join('') : LART(t.id === 'normal' ? 1 : 10)}</span></button>`).join('')}</div>`}
        ${pick ? (() => { const row = rateTable('paid', banner).rows.find((r) => r.rank === 'SS'); return row && row.pickPer ? `<p class="ty-note ty-pickrate" style="margin:3px 0 0;text-align:center">目当て　${esc(pick.name)}　<strong>${pct(row.pickPer)}</strong>（一人ごと）</p>` : ''; })() : ''}
        ${web ? '' : out ? `<p class="ty-note ty-out" role="status">本日の無料登用を使い切りました。通常登用 小判${TIERS[0].cost}</p>` : ''}
        <div class="ty-sub"><button data-a="rates">提供割合</button><button data-a="hist">登用履歴</button>${o.onFormArmy ? '<button data-a="hensei">軍団編成</button>' : ''}${web || noShop() || !(armsAvailable().length + housesAvailable().length) ? '' : '<button data-a="armpick">兵種・家登用</button>'}${o.onTaisen ? '<button data-a="taisen">オンライン対戦</button>' : ''}${o.onKoukan ? '<button data-a="koukan">交換所</button>' : ''}</div>
      </div><div class="ty-right">
        ${pick ? `<div class="ty-feat" aria-label="注目の武将の全身（指で回す・横に払うと次の武将）"><span class="fn"></span><button class="fd" data-a="fdetail">詳細を見る</button></div>` : ''}
        ${tks.map(([k, n]) => `<div class="ty-tk">${n}（${tk[k]}枚）<button data-a="tk" data-k="${k}">${k === 'ssRandom' ? '使って登用する' : '武将を選んで登用する'}</button></div>`).join('')}
        <div class="ty-tk">持っている武将 ${Object.keys(st.owned).length}人・武将印 ${st.seals}</div>
      </div></div>`;
    // K600 5〜7（k600-engi）：注目武将を3D全身で（指で回す・横に払うと次の注目・武将ごとの立ちの動き・後ろにその隊）。画面を離れる時に捨てる
    // K608：幕に注目の武将の家紋と旗印・有料の札に武将の全身（3D から撮った絵）
    import('../bushou_card_art.js').then((A) => { for (const c of el.querySelectorAll('canvas[data-ty-mon]')) A.drawCardMon(c, c.dataset.tyMon, '#e8c77a') || c.remove(); for (const c of el.querySelectorAll('canvas[data-ty-flag]')) A.drawCardFlag(c, c.dataset.tyFlag) || c.remove(); }).catch(() => {});
    fillCand(el);
    const fe = el.querySelector('.ty-feat');
    if (fe) import('./toyo_reveal.js').then((R) => {
      if (!fe.isConnected) return;
      const ids = (banner.focus || []).length > 1 ? banner.focus : [pick.id, ...BUSHOU_ONLINE.filter((x) => x.house === pick.house && x.id !== pick.id && (x.rank === 'SS' || x.rank === 'S')).slice(0, 3).map((x) => x.id)];
      const list = ids.map((id) => BUSHOU_BY_ID[id]).filter(Boolean);
      let fi = Math.max(0, list.findIndex((x) => x.id === pick.id));
      const label = () => { featB = list[fi]; const n = fe.querySelector('.fn'); if (n) n.innerHTML = `<span>${MARK[featB.rank]} ${featB.rank}</span>　<span>${esc(featB.name)}</span>　<span>${armOf(featB)}</span>`; };
      label();
      feat = R.mountBushouStage(fe, list[fi], { n: 60, nobori: 20, onSwipe: (d) => { if (list.length < 2) return; fi = (fi + d + list.length) % list.length; label(); feat?.set(list[fi]); } });
    }).catch(() => {});
  };

  const bestIdx = (set) => { let bi = -1, br = 2; set.forEach((b, i) => { const r = 'NRASS'.indexOf(b.rank === 'SS' ? 'SS' : b.rank); const v = b.rank === 'SS' ? 4 : b.rank === 'S' ? 3 : b.rank === 'A' ? 2 : -1; if (v >= 3 && v > br) { br = v; bi = i; } }); return bi; };
  // 書状 → 一通ずつ開く（［一括開封］もある）→ 選ぶ。三人（無料・通常）と十人（上級・特選・K604）は同じ画面を直して使う。
  //   opt：{ tier: 'joukyu'（上級：十通・S 以上の一通だけ家紋の封）|'tokusen'（特選：大広間・法螺と旗・十通・二人まで）, picks（選べる人数） }
  //   十人の組は set.length で分かる（toyo_rules の pull が十人の組を返す）。選ぶのは［登用する］→ 確かめの札 → 確定（誤タップで決めない）
  const draw = (sets, got, k0 = 0, debut = null, opt = {}) => {
    if (sets.length - k0 > 1) return drawTen(sets, got, k0);
    import('../busho_portrait.js').then((M) => { for (const set of sets) for (const b of set) M.portrait(b.name); }).catch(() => {});
    const k = k0, set = sets[k], N = set.length, ten = N > 3, opened = set.map(() => false); let busy = false;
    const tier = opt.tier || (opt.picks === 2 || (ten && set.every((b) => b.rank === 'S' || b.rank === 'SS')) ? 'tokusen' : ten ? 'joukyu' : null), picks = opt.picks || (tier === 'tokusen' ? 2 : 1);
    const taken = [], chosen = new Set(), flat = tier === 'ten';   // 確定した武将（{ i, r }）／十回登用：選んだ印（押すたびに入れ替わる・確定は一度）
    const allOpen = () => opened.every(Boolean);
    const hint = tier === 'tokusen' ? -1 : bestIdx(set);   // S 以上が本当にいる時だけ一通に特別な封（上級は家紋の封）。特選は全員 S 以上なので封で分けない
    const nSS = set.filter((b) => b.rank === 'SS').length, nSup = set.filter((b) => b.rank === 'S' || b.rank === 'SS').length;
    const bonus = () => (tier === 'tokusen' && nSS > 3 ? `保証の3人より多い　SS ${nSS}人` : tier === 'joukyu' && nSup > 1 ? `保証の1人より多い　S 以上 ${nSup}人` : '');
    const title = opt.title || (tier === 'ten' ? (N > 1 ? '十回登用' : '登用') : tier === 'tokusen' ? '特選登用' : tier === 'joukyu' ? '上級登用' : '登用');
    const ov = () => {
      const left = picks - taken.length;
      el.innerHTML = `<div class="ty-ov jo${tier === 'tokusen' ? ' hiroma' : ''}${ten ? ' ten' : ''}"><h2>${title}${ten ? `　<span class="ty-pk">選んだ ${flat ? chosen.size : taken.length}/${flat ? N : picks}</span>` : ''}${got.length ? `　<span style="color:#f3d68a">${got.map((g) => g.label).join('・')}が届いた</span>` : ''}${debut === 'S' ? '　<span style="color:#f3d68a">初陣登用：S の武将から一人を選べます</span>' : debut === 'A' ? '　<span style="color:#f3d68a">初陣登用</span>' : ''}${allOpen() && bonus() ? `　<span class="ty-bonus">${bonus()}</span>` : ''}</h2>
        <div class="ty-desk">${set.map((b, i) => { const tk = taken.some((t) => t.i === i) || chosen.has(i); if (ten && opened[i]) return candCard(b, { a: 'card', attrs: `data-i="${i}"`, sel: tk, dim: !flat && !tk && left === 0, note: tk ? (flat ? '登用する' : '登用しました') : b.id === banner.pickup ? '目当ての武将' : st.owned[b.id] ? '持っている（武将印へ）' : '' }); return `<button class="ty-lt r-${b.rank}${!opened[i] ? ` sl-${b.rank}` : ''}${!opened[i] && (i === hint || b.rank === 'S' || b.rank === 'SS') ? ' aura' : ''}${tk ? ' taken' : ''}" data-a="card" data-i="${i}" aria-label="${opened[i] ? `${b.rank} ${b.name}${tk ? '（登用済み）' : ''}` : `書状 ${i + 1}${i === hint ? '（特別な封）' : ''}`}">
          ${opened[i] ? `<div class="op"><div class="bd" data-busho-body="${esc(b.name)}"></div><div class="in">
              <span class="rk" style="color:${RCOL[b.rank] === '#e8c25a' ? '#8a5a08' : b.rank === 'S' ? '#9a4a1a' : '#3a2a18'}">${MARK[b.rank]} ${b.rank}</span>
              ${houseTag(b, 'lg')}<span class="hs">${armChip(b)}${ten ? `　Cost ${b.cost}` : ''}</span>
              <span class="nm">${esc(b.name)}</span>${ten ? '' : `<span class="ka" data-kata="${esc(b.name)}" data-fav="${b.fav || 'std'}">得意：${KATA_NAME[b.fav || 'std'] || '標準'}</span>`}
              ${b.id === banner.pickup ? '<span class="tag">目当ての武将</span>' : ''}${st.owned[b.id] ? '<span class="tag">持っている（武将印へ）</span>' : ''}${tk ? '<span class="tag">登用しました</span>' : allOpen() && left > 0 && !ten ? `<span class="pickb" role="button" data-a="pick" data-i="${i}">登用する</span>` : ''}</div></div>`
          : `<div class="fold"><span class="ti">書状</span><span class="fu">${b.rank === 'S' || b.rank === 'SS' ? '紋' : '封'}</span></div>`}</button>`; }).join('')}</div>
        <div class="ty-foot">${!allOpen() ? `<button data-a="all">${N > 1 ? '一括開封' : '開封'}</button>` : flat ? `${chosen.size ? `<button data-a="tfin">${chosen.size}人を登用する</button>` : `<button class="sec" data-a="no3">誰も登用しない</button>${moreBtn(N)}`}` : taken.length ? (left > 0 && ten ? `<button data-a="fin">この${taken.length}人で確定する</button>` : '') : `<button class="sec" data-a="no3">登用しない</button>${moreBtn(N)}`}</div>
        <p class="ty-note" style="text-align:center">${allOpen() ? (flat ? (N > 1 ? '武将を押すと詳細が開き、そこで選べます（全員でも一人でも）。選ばなかった武将は今回は見送りです' : '札を押すと詳細が開き、そこで登用できます。選ばなければ今回は見送りです') : ten ? `${N}人から${left > 0 ? `最大あと${left}人` : ''}まで選べます（欲しい人だけでよい・書状を押すと確かめの札）。選ばなかった武将は今回は見送りです` : '三人から一人を選びます。選ばなかった二人は今回は見送りです') : N > 1 ? '書状を一通ずつ開きます' : '書状を開きます'}</p></div>`;
      if (opened.some(Boolean)) import('../bushou_card_art.js').then((A) => A.fillCardArt(el)).catch(() => {});
      fillCand(el);   // K600・K606：札の全身（[data-busho-body]）と家紋
      // 型の一行（得意の兵種・固有戦術の名）＝「この武将でこういう戦い方」
      if (opened.some(Boolean) && !ten) import('./tactics.js').then((T) => { for (const n of el.querySelectorAll('[data-kata]')) { const t = T.TACTICS[T.BUSHO_TACTIC[n.dataset.kata]] || T.PASSIVES?.[T.BUSHO_PASSIVE?.[n.dataset.kata]]; if (t) n.textContent = `得意：${KATA_NAME[n.dataset.fav] || '標準'}・${t.name}`; } }).catch(() => {});
    };
    const openOne = async (i, skip) => {
      if (opened[i]) return null;
      const card = el.querySelector(`[data-i="${i}"]`);
      const r = await reveal(card, set[i], { skip, root: el.querySelector('.ty-ov') || el });
      opened[i] = true;
      if (r && r.skipAll) opened.fill(true);   // 登場の［全部飛ばす］＝残りの書状も開く
      if (allOpen() && bonus()) { import('../audio.js').then((A) => A.sfx?.('otaiko', 0.8)).catch(() => {}); }   // 保証より多く出た時の嬉しさ：大太鼓を一打
      return r;
    };
    // 確かめの札（K604：タップ→詳細→「この武将を登用しますか？」→確定。誤タップで決めない・確定前なら選び直せる）
    const confirm = (i) => {
      const b = set[i];
      el.insertAdjacentHTML('beforeend', `<div class="ty-ov ty-cf" style="background:#0b0806e8;align-items:center;justify-content:center;z-index:4"><div style="border:1px solid #b8955a;background:#1c1813;padding:14px 18px;border-radius:6px;text-align:center;max-width:420px">
        <div style="font-size:18px;color:#e8c77a"><span>${MARK[b.rank]} ${b.rank}</span>　<span>${esc(b.name)}</span></div><p class="ty-note">主兵種 ${armOf(b)}・率いる兵 ${armOf(b)}${troopsOf(b)}・Cost ${b.cost}</p>
        <p style="margin:6px 0 10px">この武将を登用しますか？${picks > 1 && taken.length === 0 ? '（あと一人、残りから選べます）' : ''}</p>
        <div class="ty-foot"><button data-a="cfy">登用する</button><button class="sec" data-a="cfd">詳細を見る</button><button class="sec" data-a="cfn">選び直す</button></div></div></div>`);
      el.querySelector('.ty-cf').dataset.i = i;
    };
    const take = (i) => {
      const r = (taken.length === 0 ? choosePending(st, k, set[i], banner) : choose(st, set[i], banner)) || { b: set[i], dup: false, seal: 0 };
      taken.push({ i, r }); save();
      if (taken.length >= picks) return done(taken.map((t) => t.r));
      ov();
    };
    const handler = async (e) => {
      const b = e.target.closest('[data-a]'); if (!b || busy) return;
      const a = b.dataset.a;
      if (a === 'card') { const i = +b.dataset.i; if (!opened[i]) { busy = true; await openOne(i, false); busy = false; ov(); } else if (allOpen()) { const rb = () => { el.onclick = handler; ov(); };   // K640：札を押すとその場に詳細（選べる時は［登用する］／［選ぶ］をそこに）
        if (flat) detail(set[i], rb, { label: chosen.has(i) ? '選びをやめる' : '選ぶ', fn: () => { chosen.has(i) ? chosen.delete(i) : chosen.add(i); rb(); } });
        else if (taken.length < picks && !taken.some((t) => t.i === i)) detail(set[i], rb, { label: '登用する', fn: () => { rb(); confirm(i); } });
        else detail(set[i], rb); } }
      else if (a === 'pick') { const i = +b.dataset.i; if (allOpen() && !taken.some((t) => t.i === i)) confirm(i); }
      else if (a === 'cfy') { const i = +el.querySelector('.ty-cf').dataset.i; take(i); }
      else if (a === 'cfn') el.querySelector('.ty-cf')?.remove();
      else if (a === 'cfd') { const i = +el.querySelector('.ty-cf').dataset.i; detail(set[i], () => { el.onclick = handler; ov(); confirm(i); }); }
      else if (a === 'all') { busy = true; for (let i = 0; i < N; i++) { const r = await openOne(i, true); if (r && r.skipAll) break; } busy = false; ov(); }
      else if (a === 'rec') confirm(+b.dataset.i);
      else if (a === 'no3') {
        el.innerHTML = `<div class="ty-ov"><h2>${ten ? `この${N}人からは登用しません` : 'この三人からは登用しません'}</h2><div class="ty-scroll"><p class="ty-note">登用の回数は使われます。全員を見送ると、この組はもう選べません。</p></div>
          <div class="ty-foot"><button data-a="no3y">登用しない</button><button class="sec" data-a="no3n">戻って選ぶ</button></div></div>`;
      } else if (a === 'tsort') { const ids = [...chosen].map((i) => set[i].id), R = (x) => ['SS', 'S', 'A', 'R', 'N'].indexOf(x.rank); set.sort((x, y) => R(x) - R(y)); chosen.clear(); ids.forEach((id) => chosen.add(set.findIndex((b) => b.id === id))); ov();
      } else if (a === 'tfin') { if (!chosen.size) return; const rs = [...chosen].sort((x, y) => x - y).map((i, n) => (n === 0 ? choosePending(st, k, set[i], banner) : choose(st, set[i], banner)) || { b: set[i], dup: false, seal: 0 }); save(); done(rs);
      } else if (a === 'fin') { if (taken.length) done(taken.map((t) => t.r));
      } else if (a === 'more3') { const m = moreOf(N); if (!m.ok) return; declinePending(st, k); save(); m.go();
      } else if (a === 'no3y') { declinePending(st, k); save(); skipped(); }
      else if (a === 'no3n') ov();
    };
    // 暗転 → 使者：短く（タップで飛ばせる・動きを減らす設定では出さない）。特選は最初から大広間・法螺と旗
    if (reduceMotion()) { el.onclick = handler; return ov(); }
    el.innerHTML = tier === 'tokusen'
      ? '<div class="ty-ov jo hiroma" style="align-items:center;justify-content:center;cursor:pointer"><div class="ty-hb l" aria-hidden="true"></div><div class="ty-hb r" aria-hidden="true"></div><div style="font-size:20px;letter-spacing:.2em;color:#f3d68a;text-shadow:0 2px 6px #000;background:#0009;padding:8px 18px;border:1px solid #c9a24a">大広間に 書状が十通 並びました</div></div>'
      : `<div class="ty-ov jo" style="align-items:center;justify-content:center;cursor:pointer"><div style="font-size:20px;letter-spacing:.2em;color:#e8c77a;text-shadow:0 2px 6px #000;background:#0009;padding:8px 18px;border:1px solid #8a7350">使者が 書状を${ten ? '十通' : '三通'} 届けました</div></div>`;
    if (tier === 'tokusen') import('../audio.js').then((A) => { A.initAudio?.(); A.signal?.('hora', 0, 0.9); }).catch(() => {});
    if (tier === 'tokusen') import('../bushou_card_art.js').then((A) => { for (const h of el.querySelectorAll('.ty-hb')) for (let j = 0; j < 3; j++) { const c = document.createElement('canvas'); c.width = 40; c.height = 110; A.drawCardFlag(c, ['織田信長', '武田信玄', '上杉謙信', '徳川家康', '毛利元就', '島津義久'][j + (h.classList.contains('r') ? 3 : 0)]); h.appendChild(c); } }).catch(() => {});
    let went = false; const go = () => { if (went) return; went = true; el.onclick = handler; ov(); };
    el.onclick = go; setTimeout(go, tier === 'tokusen' ? 1800 : 900);
  };
  // 十回：三人の組を十行に並べ、各行から一人を選ぶ。N・R は一覧のまま速く、S 以上の行は枠で目立たせる。［全部スキップ］＝おすすめで全部選ぶ
  // K614（kaito 11/21）：十回登用は「組」をやめ、書状十通 → 武将十人（上級・特選と同じ十人の画面）から欲しい人だけ選ぶ。
  //   一通に一人＝その組の一番上の格の武将（同じ格ならおすすめ）。選んだ人は choosePending、選ばない人は見送り（declinePending）。決まりは k598-toyo（toyo_rules）
  const drawTen = (sets, got, k0) => {
    const rows = sets.slice(k0);
    const RK = (b) => 'NRASS'.indexOf(b.rank === 'SS' ? 'SS' : b.rank);
    // 同じ武将が二通に出ないよう、もう出した人はその組の次の人に（組の三人が皆出ていれば、そのまま）
    const used = new Set();
    const pick = rows.map((set) => {
      const rec = set[recommend(set, st, banner)];
      const order = set.slice().sort((a, b) => RK(b) - RK(a) || (b === rec) - (a === rec));
      const c = order.find((b) => !used.has(b.id)) || order[0]; used.add(c.id); return c;
    });
    const sel = rows.map(() => false);
    import('../busho_portrait.js').then((M) => { for (const b of pick) M.portrait(b.name); }).catch(() => {});
    const commit = () => {
      const res = rows.map((set, r) => { if (sel[r]) return choosePending(st, k0 + r, pick[r], banner); declinePending(st, k0 + r); return null; }).filter(Boolean);
      save(); if (!res.length) return skipped(); done(res);
    };
    const ov = () => {
      const n = sel.filter(Boolean).length;
      el.innerHTML = `<div class="ty-ov"><h2>十回登用　<span class="ty-pk">選んだ ${n}/${rows.length}</span>${got.length ? `　<span style="color:#f3d68a">${got.map((g) => g.label).join('・')}が届いた</span>` : ''}</h2>
        <div class="ty-g5">${pick.map((b, r) => candCard(b, { a: 'c', attrs: `data-r="${r}"`, sel: sel[r], note: st.owned[b.id] ? '持っている（武将印へ）' : b.id === banner.pickup ? '目当ての武将' : '' })).join('')}</div>
        <p class="ty-note" style="text-align:center;margin:0">武将を押すと詳細が開き、そこで選べます。選ばない武将は見送りです</p>
        <div class="ty-foot"><button data-a="ok"${n ? '' : ' class="sec"'}>${n ? `${n}人を登用する` : '誰も登用しない'}</button>${n < rows.length ? '<button class="sec" data-a="selall">全員を選ぶ</button>' : ''}</div></div>`;
      fillCand(el);
    };
    const onc = el.onclick = (e) => {
      const b = e.target.closest('[data-a]'); if (!b || b.disabled || (lbusy && b.dataset.a !== 'lo')) return;
      if (b.dataset.a === 'c') { const r = +b.dataset.r; const rb = () => { el.onclick = onc; ov(); }; detail(pick[r], rb, { label: sel[r] ? '選びをやめる' : '選ぶ', fn: () => { sel[r] = !sel[r]; rb(); } }); }
      else if (b.dataset.a === 'selall') { sel.fill(true); ov(); }
      else if (b.dataset.a === 'ok') commit();
      else if (b.dataset.a === 'lo') openL(+b.dataset.r, false);
      else if (b.dataset.a === 'lall') { lbusy = true; rows.forEach((_, r) => setTimeout(() => openL(r, true), r * 140)); setTimeout(() => { lbusy = false; lfoot(); }, rows.length * 140 + 200); }
      else if (b.dataset.a === 'lgo') ov();
    };
    // K608：まず書状が十通届き、一通ずつ開く（押す・［全部開く］）。開くと、その一人の全身と格の色。SS の書状は一人ずつの登場（toyo_reveal）を流す（［全部開く］の時は飛ばす）
    const lopen = rows.map(() => false); let lbusy = false;
    const lfoot = () => { const f = el.querySelector('.ty-lfoot'); if (f) f.innerHTML = lopen.every(Boolean) ? '<button data-a="lgo">十人から選ぶ</button>' : '<button data-a="lall">全部開く</button>'; };
    const openL = async (r, quick) => {
      if (lopen[r]) return; lopen[r] = true;
      const t = pick[r], card = el.querySelector(`.ty-lt[data-r="${r}"]`); if (!card) return;
      if (!quick && t.rank === 'SS') { lbusy = true; const x = await reveal(card, t, { skip: false, root: el.querySelector('.ty-ov') || el }); lbusy = false; if (x && x.skipAll) { rows.forEach((_, j) => openL(j, true)); } }
      card.classList.remove('aura', `sl-${t.rank}`); card.classList.add('opened');
      card.innerHTML = `<div class="op"><div class="bd" data-busho-body="${esc(t.name)}"></div><div class="in"><span class="rk">${t.rank}</span><span class="nm">${esc(t.name)}</span><span class="hs">${armOf(t)}</span></div></div>`;
      if (t.rank === 'SS' || t.rank === 'S') import('../audio.js').then((A) => A.sfx?.('otaiko', t.rank === 'SS' ? 0.8 : 0.5)).catch(() => {});
      fillCand(card); if (!lbusy) lfoot();
    };
    const intro = () => {
      el.innerHTML = `<div class="ty-ov jo ten"><h2>十回登用${got.length ? `　<span style="color:#f3d68a">${got.map((g) => g.label).join('・')}が届いた</span>` : ''}</h2>
        <div class="ty-desk">${pick.map((t, r) => `<button class="ty-lt r-${t.rank} sl-${t.rank}${t.rank === 'SS' || t.rank === 'S' ? ' aura' : ''}" data-a="lo" data-r="${r}" aria-label="書状 ${r + 1}"><div class="fold"><span class="ti">書状</span><span class="fu">${t.rank === 'SS' || t.rank === 'S' ? '紋' : '封'}</span></div></button>`).join('')}</div>
        <div class="ty-foot ty-lfoot"></div><p class="ty-note" style="text-align:center;margin:0">書状が十通届きました。押すと開きます</p></div>`;
      lfoot();
    };
    intro();
  };
  // 登用の結果：「〇〇を登用しました［軍団に編成］［模擬合戦で試す］［詳細を見る］［続けて登用］」（K598・K600 36〜37）。重なれば武将印へ（51〜53）
  let again = null;   // 案N：結果の画面からもう一度（{ id }＝段／{ a }＝ホームの釦）
  let prod = '通常登用';   // いま引いている商品（登用履歴に残す）
  const noteHist = (results) => { st.hist = (st.hist || []).concat(results.map((r) => ({ id: r.b.id, p: prod, dup: r.dup ? 1 : 0 }))).slice(-40); save(); };
  // K631 ④：誰も登用しなかった時は登用のホームへ戻さず、その場で［もう一回引く］（一回・十回）。引き方は直前と同じ（無料→無料／段→同じ段）
  // 一回＝web は無料の一回／アプリは無料が残る間は無料・尽きたら通常登用　十回＝web は十回／アプリは十名の上級登用
  const drawNow = (n) => { if (web) { bind(); el.querySelector(`[data-a="${n === 10 ? 'wten' : 'wone'}"]`)?.click(); } else if (n === 10) tierGo('joukyu'); else if (st.free > 0) { bind(); el.querySelector('[data-a="free"]')?.click(); } else tierGo('normal'); };
  const nowLabel = (n) => (n === 10 ? (web ? '十回引く（無料）' : `十回引く（上級登用・小判 ${tierOf('joukyu').cost.toLocaleString('ja-JP')}）`) : web ? 'もう一回引く（無料）' : st.free > 0 ? `もう一回引く（無料・残り ${st.free}回）` : `もう一回引く（通常登用・小判 ${tierOf('normal').cost.toLocaleString('ja-JP')}）`);
  // 候補の画面の［誰も登用しない］の隣：もう一回（十回）。釦に費用を書き、足りない時は押せない形で理由を出す
  const moreOf = (n) => {
    const w = n > 1 ? 'もう十回' : 'もう一回', K = (v) => v.toLocaleString('ja-JP');
    let cost = 0, free = false, go;
    const tid = (again && again.id) || (n > 1 && !web ? 'joukyu' : null);   // 閉じて開き直した十名の組は上級として引き直す
    if (tid) { cost = tierOf(tid).cost; go = () => tierGo(tid); }
    else if (web) { free = true; go = () => drawNow(n > 1 ? 10 : 1); }
    else if (st.free > 0) { free = true; go = () => drawNow(1); }
    else { cost = tierOf('normal').cost; go = () => tierGo('normal'); }
    if (free) return { label: `${w}（無料${web ? '' : `・残り ${st.free}回`}）`, ok: true, go };
    const ok = (st.kin || 0) >= cost;
    return { label: ok ? `${w}（小判 ${K(cost)}）` : `${w}（小判 ${K(cost)}・あと ${K(cost - (st.kin || 0))} 足りません）`, ok, go };
  };
  const moreBtn = (n) => { const m = moreOf(n); return `<button class="sec" data-a="more3"${m.ok ? '' : ' disabled'}>${m.label}</button>`; };
  const skipped = () => {
    const tier = again && again.id ? tierOf(again.id) : null;
    el.innerHTML = `<div class="ty-ov"><h2>今回は誰も登用しませんでした</h2><div class="ty-scroll"><p class="ty-note" style="text-align:center">続けて引けます</p></div>
      <div class="ty-foot" style="flex-wrap:wrap">${tier ? (st.kin >= tier.cost ? `<button data-a="again">もう一回引く（${tier.name}・小判 ${tier.cost.toLocaleString('ja-JP')}）</button>` : '') : `<button data-a="s1">${nowLabel(1)}</button><button data-a="s10" class="sec">${nowLabel(10)}</button>`}<button class="sec" data-a="back">ホームへ</button></div></div>`;
    el.onclick = (e) => {
      const b = e.target.closest('[data-a]'); if (!b) return;
      const a = b.dataset.a;
      if (a === 'again') tierGo(again.id);
      else if (a === 's1' || a === 's10') drawNow(a === 's10' ? 10 : 1);
      else bind();
    };
  };
  const done = (results) => {
    noteHist(results);
    const bs = results.map((r) => r.b);
    const one = bs.length === 1, b0 = bs[0];
    const firstS = one && (b0.rank === 'S' || b0.rank === 'SS') && !st.firstS;   // 最初の S 以上：そのまま模擬合戦へ（96）
    if (firstS) { st.firstS = 1; save(); }
    const dupNote = (r) => (r.dup ? `すでに登用済みです。武将印 ${r.seal} に変えました（交換所で使えます）` : '');
    el.innerHTML = `<div class="ty-ov"><h2>${one ? `${esc(b0.name)}を登用しました` : `${bs.length}人を登用しました`}</h2>
      ${one ? `<div class="ty-cards"><div class="ty-got" data-a="detail" style="cursor:pointer;flex:2.2;min-width:0;position:relative;border:1px solid #5a4a32;border-radius:4px;overflow:hidden;background:#0006" aria-label="${esc(b0.name)}と率いる${armOf(b0)}の隊">${houseTag(b0, 'lg ov')}<span class="ty-gs"><b class="ty-gk r-${b0.rank}">${MARK[b0.rank]} ${b0.rank}</b>${armChip(b0)}</span></div></div>
        <p class="ty-note" style="text-align:center" id="ty-info">${infoLine(b0, null)}</p>${results[0].dup ? `<p class="ty-note" role="status" style="text-align:center">${dupNote(results[0])}</p>` : ''}`
      : results.length > 2 ? `<div class="ty-g5">${results.map((r, i) => candCard(r.b, { a: 'rd', attrs: `data-i="${i}"`, note: r.dup ? `武将印 +${r.seal}` : '新しく登用' })).join('')}</div>`
      : `<div class="ty-desk">${results.map((r, i) => candCard(r.b, { a: 'rd', attrs: `data-i="${i}"`, note: r.dup ? `武将印 +${r.seal}` : '新しく登用' }).replace('class="ty-cc', 'style="width:150px;height:100%" class="ty-cc')).join('')}</div>`}
      <p class="ty-note ty-use">登用した武将はオンライン対戦で使用します</p>
      <div class="ty-foot" style="flex-wrap:wrap">${o.onFormArmy ? '<button data-a="army">軍団に入れる</button>' : ''}${o.onTaisen ? '<button data-a="taisen" class="sec">オンライン対戦へ</button>' : ''}${one ? '<button data-a="detail" class="sec">詳細を見る</button>' : ''}${(() => { if (!again) return ''; if (again.id) { const t = tierOf(again.id); return st.kin >= t.cost ? `<button data-a="again">もう一度 ${t.name}（小判 ${t.cost.toLocaleString('ja-JP')}・残り ${st.kin.toLocaleString('ja-JP')}）</button>` : ''; } if (again.a === 'free') return st.free > 0 ? `<button data-a="again">もう一度 無料登用（残り ${st.free}回）</button>` : ''; return `<button data-a="again">もう一度（無料）</button>`; })()}${o.onKoukan && results.some((r) => r.dup) ? '<button data-a="koukan2" class="sec">交換所</button>' : ''}${again && !again.id ? `<button data-a="again10" class="sec">${nowLabel(10)}</button>` : ''}<button data-a="more" class="sec">続けて登用</button><button class="sec" data-a="back">戻る</button></div></div>`;
    if (!one) fillCand(el);   // K606：十人の結果も全身と家紋の札
    if (one) {
      import('../bushou_card_art.js').then((A) => A.fillCardArt(el)).catch(() => {});
      import('./tactics.js').then((T) => { const t = T.TACTICS[T.BUSHO_TACTIC[b0.name]]; const n = el.querySelector('#ty-info'); if (n) n.textContent = infoLine(b0, t ? t.name : 'なし'); }).catch(() => {});
    }
    // K601 54〜55（k600-engi）：取った武将の全身3D＋背後にその主兵種の隊（滝川＝鉄砲隊・山県＝赤備えの騎馬）。画面を離れる時に捨てる
    let got = null;
    if (one) import('./toyo_reveal.js').then(async (R) => {
      const g = el.querySelector('.ty-got'); if (!g || !g.isConnected) return;
      // K635①：描いた肖像があれば3Dの座った姿の代わりにそれを敷く（家紋・格・兵種の札はその上）
      if ((await R.portraits()).has(b0.id)) { const im = new Image(); im.src = R.portraitSrc(b0.id); im.alt = ''; im.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:contain;object-position:50% 50%;z-index:0'; g.prepend(im); return; }
      got = R.mountBushouStage(g, b0, { studio: true });
    }).catch(() => {});
    el.onclick = (e) => {
      const b = e.target.closest('[data-a]'); if (!b) return;
      const a = b.dataset.a;
      got?.dispose(); got = null;
      if (a === 'army') { el.remove(); o.onFormArmy(); }
      else if (a === 'taisen') { el.remove(); o.onTaisen(); }
      else if (a === 'trial') { el.remove(); o.onTrial(b0.id); }
      else if (a === 'detail') detail(b0, () => done(results));
      else if (a === 'rd') detail(results[+b.dataset.i].b, () => done(results));   // K640：結果の札を押すとその場に詳細
      else if (a === 'again10') drawNow(10);
      else if (a === 'again') { if (again.id) tierGo(again.id); else { bind(); el.querySelector(`[data-a="${again.a}"]`)?.click(); } }
      else if (a === 'koukan2') o.onKoukan(() => done(results));
      else bind();
    };
  };
  // 武将の詳細（K600 8・12 の一部）：格・家・コスト・得意の兵種・固有戦術。3D 全身と能力・おすすめ配置は後の係が足す
  const detail = (b, back, pick = null) => {
    // K601 11〜18（k600-engi）：大きな3D全身＋右に情報・タブ［能力］［戦法］［家宝］［戦歴］・主兵種・率いる部隊（toyo_detail.js）
    el.onclick = null;
    el.innerHTML = '<div class="ty-ov"></div>';
    import('./toyo_detail.js').then((D) => D.openBushouDetail(el.querySelector('.ty-ov'), b, { arm: armOf(b), onBack: back, onPick: pick && pick.fn, pickLabel: pick && pick.label })).catch(() => back());
  };
  // ---- 商品の段（K604）：通常・上級・特選。押す前の説明 → 登用 → 候補（3人は書状・10人は一覧）→ タップ → 詳細 → 「この武将を登用しますか？」→ 確定
  // K624①：兵種登用（騎馬武将登用・鉄砲武将登用…）の兵種を選ぶ。10名とも その兵種で、S以上1名確定（上級と同じ形）
  const armPick = () => {
    el.innerHTML = `<div class="ty-ov"><h2>兵種・家登用</h2><div class="ty-scroll"><p class="ty-note">10名とも選んだ兵種（または家）の武将です。S 以上が1名は必ず入ります。その中から1名を登用できます。</p>
      <div class="ty-tiers g" role="group" aria-label="兵種・家">${armsAvailable().map((a) => `<button class="ty-tier" data-a="arm" data-id="arm:${a}"><span class="ty-arm" aria-hidden="true"><i>${ARM_MARK[a]}</i></span><b>${a}武将登用</b><small>小判 ${tierOf('arm:' + a).cost.toLocaleString('ja-JP')}</small></button>`).join('')}${housesAvailable().map((h) => `<button class="ty-tier" data-a="arm" data-id="house:${h}"><span class="ty-arm" aria-hidden="true"><i>家</i></span><b>${houseNameOf(h)}武将登用</b><small>小判 ${tierOf('house:' + h).cost.toLocaleString('ja-JP')}</small></button>`).join('')}</div></div>
      <div class="ty-foot"><button class="sec" data-a="back">戻る</button></div></div>`;
    el.onclick = (e) => { const b = e.target.closest('[data-a]'); if (!b) return; if (b.dataset.a === 'arm') return tierIntro(b.dataset.id); bind(); };
  };
  const tierIntro = (id) => {
    const t = tierOf(id);
    el.innerHTML = `<div class="ty-ov"><h2>${t.name}　小判 ${t.cost.toLocaleString('ja-JP')}</h2><div class="ty-scroll">
      <p style="font-size:17px;margin:6px 0">${t.line}</p>
      <p class="ty-note">${t.say}</p>
      <p class="ty-note">いまの小判 ${st.kin.toLocaleString('ja-JP')}。登用の前に［提供割合］で、保証の外の枠の率も見られます。</p>
      <p class="ty-note ty-use">登用した武将はオンライン対戦で使用します</p></div>
      <div class="ty-foot" style="flex-wrap:wrap"><button class="sec" data-a="list">候補武将一覧</button><button class="sec" data-a="trates">提供割合</button><button data-a="go">登用</button><button class="sec" data-a="back">戻る</button></div></div>`;
    el.onclick = (e) => {
      const b = e.target.closest('[data-a]'); if (!b) return;
      const a = b.dataset.a;
      if (a === 'list') tierList(id); else if (a === 'trates') tierRatesView(id); else if (a === 'go') tierGo(id); else bind();
    };
  };
  const tierList = (id) => {
    const t = tierOf(id);
    el.innerHTML = `<div class="ty-ov"><h2>${t.name}　候補武将一覧</h2><div class="ty-scroll">${tierPool(id).map((g) => `<p class="ty-note"><b>${MARK[g.rank]} ${g.rank}</b><span>（${g.list.length}名）</span>　<span>${g.list.map((b) => esc(b.name)).join('・')}</span></p>`).join('')}</div>
      <div class="ty-foot"><button class="sec" data-a="back">戻る</button></div></div>`;
    el.onclick = () => tierIntro(id);
  };
  const tierRatesView = (id) => {
    const r = tierRates(id);
    el.innerHTML = `<div class="ty-ov"><h2>${r.t.name}　提供割合</h2><div class="ty-scroll">
      <p class="ty-note">保証：${r.t.line}</p>
      ${r.groups.map((g) => `<p class="ty-note"><b>${g.label}</b>　${g.text}</p>`).join('')}
      <p class="ty-note">一人ごとの格の率です。同じ格の中では、武将ごとに同じ確率です（目当ての武将がいる時だけ、SS の枠で半分がその武将）。</p></div>
      <div class="ty-foot"><button class="sec" data-a="back">戻る</button></div></div>`;
    el.onclick = () => tierIntro(id);
  };
  const tierGo = (id) => {
    prod = `${tierOf(id).name}`; again = { id };
    const r = pullTier(st, id, rng, banner);
    if (!r.ok) return r.why === 'kin' ? lack(r.need) : bind();
    // 3人も10人も書状の画面（k600-ensyutsu の draw）。上級＝十通・紋の封・1名／特選＝大広間・十通・2名。残りの候補は st.pending に残る
    st.tierPending = null; st.pending = { ids: [r.cands.map((b) => b.id)], k: 0, got: r.got.map((g) => g.label) };
    save(); return draw([r.cands], r.got, 0, null, id === 'normal' ? {} : { tier: tierOf(id).arm || tierOf(id).house ? 'joukyu' : id, picks: r.picks, title: tierOf(id).arm || tierOf(id).house ? tierOf(id).name : undefined });
  };
  // 10人の一覧（2列×5）。タップ→詳細→この武将を登用しますか？。2名の商品は2人目（残りから）→まとめ→確定。確定の前なら選び直せる
  const tierPick = (cands, t, got = []) => {
    const sel = [];
    const grid = () => {
      const left = t.picks - sel.length;
      el.innerHTML = `<div class="ty-ov"><h2>${t.name}　<span class="ty-pk">選んだ ${sel.length}/${t.picks}</span>${got.length ? `　<span style="color:#f3d68a">${got.map((g) => g.label).join('・')}が届いた</span>` : ''}</h2>
        <div class="ty-g5">${cands.map((b, i) => candCard(b, { a: 'tc', attrs: `data-i="${i}"`, sel: sel.includes(b.id), dim: left === 0 && !sel.includes(b.id) })).join('')}</div>
        <p class="ty-note" style="text-align:center">${t.picks === 2 ? `${left > 0 ? `あと ${left}名 選べます（${sel.length}／2）` : '2名を選びました'}` : '1名を選びます'}。タップで詳細を見られます</p>
        <div class="ty-foot">${sel.length ? '<button class="sec" data-a="redo">選び直す</button>' : ''}<button class="sec" data-a="later">あとで選ぶ</button></div></div>`;
      fillCand(el);
    };
    const summary = () => {
      const bs = sel.map((id) => BUSHOU_BY_ID[id]);
      el.innerHTML = `<div class="ty-ov"><h2>この${bs.length}名を登用しますか？　<span class="ty-pk">選んだ ${bs.length}/${t.picks}</span></h2><div class="ty-desk">${bs.map((b) => candCard(b, { tag: 'div', sel: true }).replace('class="ty-cc', 'style="width:150px;height:100%" class="ty-cc')).join('')}</div>
        <p class="ty-note" style="text-align:center">確定すると、ほかの武将は選べなくなります。</p>
        <div class="ty-foot"><button data-a="ok">確定して登用する</button><button class="sec" data-a="redo">選び直す</button></div></div>`;
      fillCand(el);
    };
    const confirmOne = (b) => {   // 詳細＋「この武将を登用しますか？」
      el.innerHTML = `<div class="ty-ov"><h2>${MARK[b.rank]} ${b.rank}　${esc(b.name)}</h2><div class="ty-scroll"><dl class="ty-detail">
        <dt>家</dt><dd>${houseTag(b)}</dd><dt>主兵種</dt><dd>${armOf(b)}　率いる部隊 ${armOf(b)} 1000</dd><dt>Cost</dt><dd>${b.cost}</dd><dt>固有戦術</dt><dd id="ty-tac">…</dd></dl>
        <p style="font-size:17px;margin:8px 0">この武将を登用しますか？</p></div>
        <div class="ty-foot"><button data-a="yes">登用する</button><button class="sec" data-a="no">選び直す</button></div></div>`;
      import('./tactics.js').then((T) => { const x = T.TACTICS[T.BUSHO_TACTIC[b.name]]; const n = el.querySelector('#ty-tac'); if (n) n.textContent = x ? `${x.name}：${x.desc}` : 'なし'; }).catch(() => {});
      el.onclick = (e) => {
        const x = e.target.closest('[data-a]'); if (!x) return;
        el.onclick = main;
        if (x.dataset.a === 'no') return grid();
        sel.push(b.id);
        if (sel.length < t.picks) return grid();
        if (t.picks === 1) return finish();
        summary();
      };
    };
    const finish = () => { const res = confirmPicks(st, sel, banner); save(); if (!res) { bind(); return; } done(res); };
    const main = (e) => {
      const b = e.target.closest('[data-a]'); if (!b) return;
      const a = b.dataset.a;
      if (a === 'tc') { const c = cands[+b.dataset.i]; if (sel.includes(c.id)) { sel.splice(sel.indexOf(c.id), 1); grid(); } else confirmOne(c); }
      else if (a === 'redo') { sel.length = 0; grid(); }
      else if (a === 'ok') finish();
      else if (a === 'later') bind();
    };
    el.onclick = main;
    grid();
  };
  // 登用履歴（K600 91）：直近の結果と天井の進み
  // 持っている武将（K608）：兵種とレアで絞る。重なって武将印に変えた分は数えない（持っている人だけ）
  const owned = (fa = '', fr = '') => {
    const ids = Object.keys(st.owned || {}).filter((id) => st.owned[id] && BUSHOU_BY_ID[id]);
    const all = ids.map((id) => BUSHOU_BY_ID[id]).sort((x, y) => ['SS', 'S', 'A', 'R', 'N'].indexOf(x.rank) - ['SS', 'S', 'A', 'R', 'N'].indexOf(y.rank));
    const list = all.filter((b) => (!fa || armOf(b) === fa) && (!fr || b.rank === fr));
    const chip = (kind, v, label) => `<button class="${(kind === 'a' ? fa : fr) === v ? '' : 'sec'}" data-a="of" data-k="${kind}" data-v="${v}" aria-pressed="${(kind === 'a' ? fa : fr) === v}">${label}</button>`;
    el.innerHTML = `<div class="ty-ov"><h2>持っている武将　${list.length}／${all.length}人</h2>
      <div class="ty-foot" style="flex-wrap:wrap;justify-content:flex-start">${chip('a', '', '兵種：全て')}${['槍', '騎馬', '鉄砲', '弓'].map((v) => chip('a', v, v)).join('')}</div>
      <div class="ty-foot" style="flex-wrap:wrap;justify-content:flex-start">${chip('r', '', 'レア：全て')}${['SS', 'S', 'A', 'R', 'N'].map((v) => chip('r', v, v)).join('')}</div>
      <div class="ty-scroll">${list.length ? `<table class="ty-tbl">${list.map((b) => `<tr><td>${MARK[b.rank]} ${b.rank}</td><td>${esc(b.name)}</td><td>${armOf(b)}</td><td>${houseTag(b, 'sm')}</td><td>Cost ${b.cost}</td></tr>`).join('')}</table>` : '<p class="ty-note">この条件の武将は、まだいません</p>'}</div>
      <div class="ty-foot">${o.onFormArmy ? '<button data-a="army">軍団に入れる</button>' : ''}<button class="sec" data-a="back">戻る</button></div></div>`;
    el.onclick = (e) => {
      const b = e.target.closest('[data-a]'); if (!b) return;
      if (b.dataset.a === 'back') return bind();
      if (b.dataset.a === 'army') { el.remove(); return o.onFormArmy(); }
      if (b.dataset.a === 'of') return b.dataset.k === 'a' ? owned(b.dataset.v, fr) : owned(fa, b.dataset.v);
    };
  };
  // 十回登用（K614）：「3人×10組」をやめ、書状十通→武将十人が並び、欲しい人だけ選ぶ（全員でも一人でも・選ばなかった人は登用しない）。
  //   各組の先頭一人を並べる（一人ごとの率は組の中の位置で変わらない）。天井・初陣登用・目当ての数えは十回分のまま
  const drawFlat = (r) => {
    const men = r.sets.map((set) => set[0]);
    st.pending = { ids: [men.map((b) => b.id)], k: 0, got: (r.got || []).map((g) => g.label), tier: 'ten' };
    save(); draw([men], r.got || [], 0, r.debut, { tier: 'ten', picks: men.length });
  };
  const hist = () => {
    const pl = pityLeft(st, banner), H = (st.hist || []).slice(-20).reverse();
    const bar = (n, m) => `<span aria-hidden="true" style="display:inline-block;width:90px;height:8px;background:#3a2c1a;vertical-align:middle;margin:0 6px"><i style="display:block;height:100%;width:${Math.min(100, Math.round(100 * n / m))}%;background:#e8c77a"></i></span>`;
    el.innerHTML = `<div class="ty-ov"><h2>登用履歴</h2><div class="ty-scroll">
      <p class="ty-note">天井：${pl.next.label}まで${bar(st.pity, pl.next.at)}<b>${st.pity}/${pl.next.at}</b></p>${pick ? `<p class="ty-note">${esc(pick.name)}の確定まで${bar(st.pickupPity, PICKUP_AT)}<b>${st.pickupPity}/${PICKUP_AT}</b></p>` : ''}<p class="ty-note">注目の期間が終わっても、同じ種類の登用へ引き継ぎます。</p>
      ${H.length ? `<table class="ty-tbl"><tr><th>#</th><th>商品</th><th>格</th><th>武将</th><th>家</th><th></th></tr>${H.map((h, i) => { const b = BUSHOU_BY_ID[h.id]; return b ? `<tr><td>${i + 1}</td><td>${h.p}</td><td>${MARK[b.rank]} ${b.rank}</td><td>${esc(b.name)}</td><td>${houseTag(b, 'sm')}</td><td>${h.dup ? '武将印へ' : ''}</td></tr>` : ''; }).join('')}</table>` : (st.log || []).length ? `<table class="ty-tbl">${st.log.slice(-20).reverse().map((id, i) => { const b = BUSHOU_BY_ID[id]; return b ? `<tr><td>${i + 1}</td><td>${MARK[b.rank]} ${b.rank}</td><td>${esc(b.name)}</td><td>${houseTag(b, 'sm')}</td></tr>` : ''; }).join('')}</table>` : '<p class="ty-note">まだ登用していません</p>'}</div>
      <div class="ty-foot"><button class="sec" data-a="back">戻る</button></div></div>`;
    el.onclick = (e) => { if (e.target.closest('[data-a="back"]')) bind(); };
  };
  // 確率の表（一人ごと・三人のどれかに）と天井
  const rates = () => {
    const P = rateTable('paid', banner), F = rateTable('free', banner);
    const tb = (t, title) => `<h2 style="margin-top:6px">${title}</h2><table class="ty-tbl"><tr><th>格</th><th>一人ごと</th><th>三人のどれかに</th><th>人数</th><th>一人あたり</th></tr>
      ${t.rows.map((r) => `<tr><td>${MARK[r.rank]} ${r.rank}</td><td>${pct(r.each)}</td><td>${pct(r.any)}</td><td>${r.n}人</td><td>${r.pickPer ? `${esc(pick.name)} ${pct(r.pickPer)}・ほか ${pct(r.per)}` : pct(r.per)}</td></tr>`).join('')}</table>`;
    el.innerHTML = `<div class="ty-ov"><h2>提供割合</h2><div class="ty-scroll">
      ${TIERS.map((t) => { const r = tierRates(t.id); return `<p class="ty-note"><b>${t.name}（小判 ${t.cost.toLocaleString('ja-JP')}）</b>　${t.line}<br>${r.groups.map((g) => `${g.label}：${g.text}`).join('<br>')}</p>`; }).join('')}
      ${tb(P, '有料の登用：一人ごとの率（通常登用と、保証の外の枠）')}
      <p class="ty-note">初陣登用：始めて最初の10組のうちに A 以上の候補が一度は入ります。20組目の候補は S の三人です。</p><p class="ty-note">登用した武将はオンライン対戦で使用します。三人の候補は一人ずつ別に引きます。三人のどれかに SS が出る率 ${pct(P.anySS)}・S 以上 ${pct(P.anySUp)}。</p>
      ${pick ? `<p class="ty-note">SS が出た時、その半分は ${esc(pick.name)}。${esc(pick.name)}を登用せずに ${PICKUP_AT}回で、${esc(pick.name)}の確定券が届きます。</p>` : ''}
      <p class="ty-note">天井（有料の登用の回数）：${PITY.map((p) => `${p.at}回＝${p.label}`).join('・')}。120回で一巡し、数えは0へ戻ります。</p>
      ${tb(F, `無料の登用（毎日${FREE_DAILY}回・残りは翌日に持ち越しません）`)}
      <p class="ty-note">${isEn() ? SEAL_NOTE_EN : SEAL_NOTE}</p><p class="ty-note">${isEn() ? GUARD_NOTE_EN : GUARD_NOTE}</p></div>
      <div class="ty-foot"><button data-a="back">戻る</button></div></div>`;
    el.onclick = (e) => { if (e.target.closest('[data-a="back"]')) bind(); };
  };
  const lack = (need) => {
    el.innerHTML = `<div class="ty-ov"><h2>小判が不足しています</h2><div class="ty-scroll">
      <p class="ty-note">いまの小判 ${st.kin.toLocaleString('ja-JP')}（あと ${need.toLocaleString('ja-JP')} 必要です）</p></div>
      <div class="ty-foot"><button data-a="buy">小判を購入</button><button class="sec" data-a="no">戻る</button></div></div>`;
    el.onclick = (e) => { const b = e.target.closest('[data-a]'); if (!b) return; if (b.dataset.a === 'buy') kin(need); else bind(); };
  };
  const ask = (a, go) => {
    const n = a === 'ten' ? PRICE.ten : PRICE.one;
    if (st.kin < n) return lack(n - st.kin);
    el.innerHTML = `<div class="ty-ov"><h2>小判 ${n.toLocaleString('ja-JP')} で${a === 'ten' ? '10回' : '1回'}登用します</h2><div class="ty-scroll">
      <p class="ty-note">いまの小判 ${st.kin.toLocaleString('ja-JP')} → 登用のあと ${(st.kin - n).toLocaleString('ja-JP')}。使った小判は戻りません。</p>
      <p class="ty-note">追加登用の提供割合（一人ごと）：${rateTable('paid', banner).rows.map((r) => `${r.rank} ${pct(r.each)}`).join('・')}。くわしくは「提供割合」で見られます。</p></div>
      <div class="ty-foot"><button data-a="yes">小判 ${n.toLocaleString('ja-JP')} で登用する</button><button class="sec" data-a="no">やめる</button></div></div>`;
    el.onclick = (e) => { const b = e.target.closest('[data-a]'); if (!b) return; if (b.dataset.a === 'yes') go(); else bind(); };
  };
  // 金を足す（パックの表）。買うのは App Store（o.buyKin）。¥12,000 は目立たせない
  //   審査で要る物（33・11/21・docs/status/k588_shinsa_hyo.md A3/A5/B1/B2）：品ごとの値段（App Store の値＝o.priceOf）と中身・
  //   月次の軍資金は自動で更新しない旨・購入の復元・特定商取引法と資金決済法の表示への入口（頁の中身は 45）。押せる所は 44px・間 8px
  const LEGAL = 'https://kaitoseto1129.github.io/sengoku-daimyo-play/risshin-support/';
  let kinView = null;   // 金を足す画面を開いている間 { need, msg }（App Store の値段が後から届いたら描き直す）
  const onPrices = () => { if (!el.isConnected) { window.removeEventListener('risshin-kin-prices', onPrices); return; } if (kinView) kin(kinView.need, kinView.msg); else if (el.querySelector('.ty-tiers')) bind(); };   // K612：品の有無で登用の頭も描き直す
  window.addEventListener('risshin-kin-prices', onPrices);
  const kin = (need, msg = '') => {
    o.refreshPrices?.();
    kinView = { need, msg };
    // 価格は App Store の値（o.priceOf）が正。届くまでの既定の円は日本語の端末だけに出し、ほかの国の店では円を出さない（3.1.1・2.3.10：値段の食い違い）
    const jaLocale = (() => { try { return /^ja/i.test(navigator.language || 'ja'); } catch (e) { return true; } })();
    const yen = (f) => (o.kinState && o.kinState(f.id) === 'missing') ? '' : (o.priceOf && o.priceOf(f.id)) || (jaLocale ? `¥${f.yen.toLocaleString('ja-JP')}` : '価格は購入の画面に表示');
    el.innerHTML = `<div class="ty-ov"><h2>小判を購入${need ? `（あと ${need.toLocaleString('ja-JP')} 足りません）` : ''}</h2><div class="ty-scroll"><div class="ty-packs">
      ${PACKS.map((p, pi) => `<button class="${p.best ? 'best' : ''} ${p.quiet ? 'quiet' : ''}" data-a="buy" data-id="${p.id}"><span class="ty-koban" aria-hidden="true">${'<i></i>'.repeat(Math.min(6, pi + 1))}</span>小判 ${p.kin.toLocaleString('ja-JP')}${p.firstBonus && !st.bought[p.id] ? `<br><small>初めての時は ＋${p.firstBonus}</small>` : ''}<br>${yen(p)}</button>`).join('')}</div>
      ${msg ? `<p class="ty-note" role="status" style="color:#f3d68a">${esc(msg)}</p>` : ''}
      <p class="ty-note">今の小判 ${st.kin.toLocaleString('ja-JP')}。小判に使える期限はありません。</p>
      <p class="ty-note">支払いは App Store で行います。小判は追加登用などに使えます。戦の強さは買えません。</p>
      <p class="ty-note">提供割合は「登用」の画面の「提供割合」で、買う前にいつでも見られます。未成年の方は、保護者の同意を得てください。</p>
      <p class="ty-note">返金は Apple に申し込みます（reportaproblem.apple.com）。買った小判の払戻しは、法令で認められる場合を除き、このゲームでは行いません。</p>
      <div class="ty-legal">
        ${o.restoreKin ? '<button data-a="restore">購入を復元する</button>' : ''}
        <button data-a="url" data-u="${LEGAL}tokushoho.html">特定商取引法に基づく表記</button>
        <button data-a="url" data-u="${LEGAL}shikin.html">資金決済法に基づく表示</button>
        <button data-a="url" data-u="https://www.apple.com/legal/internet-services/itunes/dev/stdeula/">利用規約</button>
        <button data-a="url" data-u="${LEGAL}privacy.html">プライバシー</button>
      </div></div>
      <div class="ty-foot"><button class="sec" data-a="back">戻る</button></div></div>`;
    // 値段が届かない時の札（33 11/21・kin_store の kinState）：店に無い品は押せなくして「今は買えません」、つながらない時は一行で知らせる。値段が届いたら描き直す
    if (o.kinState) {
      let miss = 0, err = false;
      for (const b of el.querySelectorAll('[data-a="buy"]')) {
        const k = o.kinState(b.dataset.id);
        if (k === 'missing') { b.disabled = true; b.insertAdjacentHTML('beforeend', '<br><small>今は買えません</small>'); miss++; }
        if (k === 'error') err = true;
      }
      const all = el.querySelectorAll('[data-a="buy"]').length;
      const note = miss && miss === all ? '今この店では、小判を買えません。' : miss ? '一部の品は、今この店では買えません。' : err ? '店につながりません。通信を確かめて、少し後でもう一度開いてください。' : '';
      if (note) el.querySelector('.ty-packs')?.insertAdjacentHTML('afterend', `<p class="ty-note" role="status">${note}</p>`);
    }
    el.onclick = async (e) => {
      const b = e.target.closest('[data-a]'); if (!b || b.disabled) return;
      if (b.dataset.a === 'back') { if (o.startAt === 'kin') { el.remove(); o.onClose && o.onClose(); return; } return bind(); }   // ホームの『＋』から開いた時はホームへ戻る
      if (b.dataset.a === 'url') { try { (o.openUrl || ((u) => window.open(u, '_blank', 'noopener')))(b.dataset.u); } catch (err) { /* 開けない */ } return; }
      if (b.dataset.a === 'restore') {
        b.disabled = true;
        const n = await o.restoreKin();
        return kin(need, n === false ? '復元できませんでした。少し後でもう一度。' : '戻す買い物はありませんでした。');
      }
      const p = PACKS.find((x) => x.id === b.dataset.id);
      if (!p || !o.buyKin) return;
      const ok = await o.buyKin(p);
      if (!ok) { const why = o.kinError ? o.kinError() : buyError(); return kin(need, why === 'cancel' ? '' : why === 'offline' ? '通信できません。つながる所でもう一度押してください' : '買えませんでした。もう一度押せます'); }   // K583：失敗は字で知らせる（取りやめは出さない）
      creditPurchase(st, p, ok && ok.txId); save(); ok.finish?.();   // 同じ取引は一度だけ・取引を終えるのは保存の後（kin_store.js）
      if (o.startAt === 'kin') return kin(0);   // ホームの『＋』から：買い場のまま今の金を見せる（戻るでホームへ）
      bind();
    };
  };
  // 券：選択券は人を選ぶ・確定券はそのまま引く
  const ticket = (kind) => {
    if (kind === 'ssRandom' || kind === 'aSelect') { const r = useTicket(st, kind, rng, null, banner); save(); return r ? done([r]) : bind(); }
    const list = ticketChoices(kind, banner);
    el.innerHTML = `<div class="ty-ov"><h2>登用する武将を選ぶ</h2><div class="ty-scroll"><div class="ty-packs">
      ${list.map((b) => `<button data-a="pick" data-id="${b.id}" class="r-${b.rank}"><span class="bd" data-busho-body="${esc(b.name)}"></span>${b.rank}<br><b>${esc(b.name)}</b><br><small>${houseTag(b, 'sm')}${st.owned[b.id] ? '・持っている' : ''}</small></button>`).join('')}</div></div>
      <div class="ty-foot"><button class="sec" data-a="back">選ばずに戻る</button></div></div>`;
    fillCand(el);
    el.onclick = (e) => {
      const b = e.target.closest('[data-a]'); if (!b) return;
      if (b.dataset.a === 'pick') { const r = useTicket(st, kind, rng, b.dataset.id, banner); save(); if (r) return done([r]); }
      bind();
    };
  };

  const bind = () => {
    kinView = null;
    featOff();
    home();
    el.onclick = (e) => {
      const b = e.target.closest('[data-a]'); if (!b || b.disabled) return;
      const a = b.dataset.a;
      featOff();
      if (a === 'fdetail' && featB) return detail(featB, bind);
      if (a === 'close') { el.remove(); o.onClose && o.onClose(); return; }
      if (a === 'bn') { if (b.dataset.id !== banner.id) o.onBanner(b.dataset.id); return; }
      if (a === 'rates') return rates();
      if (a === 'hist') return hist();
      if (a === 'hensei') { el.remove(); o.onFormArmy(); return; }
      if (a === 'armpick') return armPick();
      if (a === 'taisen') { el.remove(); o.onTaisen(); return; }
      if (a === 'focus') { st.target = b.dataset.id; banner.pickup = st.target; pick = BUSHOU_BY_ID[st.target]; save(); return bind(); }
      if (a === 'koukan') return o.onKoukan(bind);  // 33 の交換所。閉じたら武将印の数を描き直す
      if (a === 'kin') return kin(0);
      if (a === 'tk') return ticket(b.dataset.k);
      if (['free', 'wone', 'wten'].includes(a)) again = { a };
      prod = { free: '無料登用', one: '通常登用', ten: '十回登用', wone: '通常登用', wten: '十回登用' }[a] || prod;
      const run = () => {
        const r = a === 'free' ? pull(st, 'free', 1, rng, banner) : a === 'one' ? pull(st, 'paid', 1, rng, banner) : a === 'ten' ? pull(st, 'paid', 10, rng, banner) : null;
        if (!r) return;
        if (!r.ok) return r.why === 'kin' ? lack(r.need) : bind();
        r.sets.length > 1 ? drawFlat(r) : (save(), draw(r.sets, r.got, 0, r.debut));
      };
      if (a === 'wone' || a === 'wten') {
        const n = a === 'wten' ? 10 : 1, keep = { kin: st.kin, free: st.free, pity: st.pity, pp: st.pickupPity, tk: { ...st.tickets }, dn: st.debutN, ds: st.debutSeen };
        st.kin = (st.kin || 0) + PRICE.ten;
        const r = pull(st, 'paid', n, rng, banner);
        st.kin = keep.kin; st.free = keep.free; st.pity = keep.pity; st.pickupPity = keep.pp; st.tickets = keep.tk; st.debutN = keep.dn; st.debutSeen = keep.ds;
        if (!r || !r.ok) return;
        return drawFlat(r);
      }
      if (a === 'tier') return tierIntro(b.dataset.id);
      if (a === 'one' || a === 'ten') return ask(a, run);
      run();
    };
  };
  bind();
  if (o.startAt === 'kin') kin(0);   // ホームの金の『＋』から（48 の hooks.kin）は買い場から開く
  // 選び終える前に閉じた組があれば、その続きから（金と天井はもう数えてある）
  { const tp = tierPendingNow(st); if (tp) { featOff(); tierPick(tp.cands, tierOf(tp.tierId), tp.got); } else { const pd = pendingSets(st); if (pd) featOff(); if (pd) draw(pd.sets, pd.got, pd.k, null, st.pending?.tier === 'ten' ? { tier: 'ten', picks: pd.sets[0].length } : {}); } }
  return { el, close: () => el.remove() };
}

// ログイン時の「本日の褒美」（K598）：無料の登用 毎日5回。強制しない（［あとで］で閉じられる）。使わない分は翌日へ持ち越さない
export function openDailyBonus(root, o = {}) {
  if (!document.getElementById('toyo-css')) { const s = document.createElement('style'); s.id = 'toyo-css'; s.textContent = CSS; document.head.appendChild(s); }
  const el = document.createElement('div'); el.className = 'toyo'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', '本日の褒美');
  el.style.cssText += ';align-items:center;justify-content:center;background:#0b0806e8;z-index:9001';
  const n = o.free ?? FREE_DAILY;
  el.innerHTML = `<div style="width:min(420px,100%);border:1px solid #b8955a;background:#1c1813;border-radius:6px;padding:14px 16px;text-align:center">
    <div style="color:#e8c77a;font-size:18px">本日の褒美</div>
    <div style="font-size:22px;margin:8px 0">武将登用　無料 ${n}回</div>
    <p class="ty-note ty-use">登用した武将はオンライン対戦で使用します</p>
    <div class="ty-foot" style="margin-top:8px"><button data-a="go" style="min-width:130px;padding:6px 14px;background:#5a1f17;border:1px solid #e8c77a">登用へ</button><button class="sec" data-a="later" style="min-width:130px;padding:6px 14px;background:#0007;border:1px solid #8a7350">あとで</button></div></div>`;
  root.appendChild(el);
  el.onclick = (e) => { const b = e.target.closest('[data-a]'); if (!b) return; el.remove(); (b.dataset.a === 'go' ? o.onGo : o.onLater)?.(); };
  return { el, close: () => el.remove() };
}
