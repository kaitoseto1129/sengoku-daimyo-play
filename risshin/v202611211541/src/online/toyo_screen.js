// 武将登用の画面（K588・docs/gacha_price_1120.md・online_req 18〜22／100「城・使者・書状。書状三通を開き、三人から一人を登用」・クラウド kaito2 k365-cloud-27・11/21）。
//   openToyo(root, o) で root の上に開く。o：{ state（toyo_rules の newToyoState）, banner（{ pickup, event, name }）, rng, onClose, onSave, buyKin(pack) }
//   本番は抽選と持ち物をサーバー（K589 Cloudflare Workers）が持つ。この画面は toyo_rules.js の関数を呼ぶだけなので、サーバーの返事に替えても形は同じ。
//   売り方の決まり（紙）：売るのはオンラインのホームと、この画面だけ。SS が出なかった後の「あと1回！」は出さない。確率と天井の残りはいつも見える所に置く。
import { PRICE, FREE_DAILY, PITY, PICKUP_AT, PACKS, pull, choose, choosePending, declinePending, pendingSets, creditPurchase, recommend, rateTable, pityLeft, ticketChoices, useTicket } from './toyo_rules.js';
import { BUSHOU_BY_ID, HOUSE_NAME, BUSHOU_ONLINE } from './bushou_online.js';
import { GUARD_NOTE, SEAL_NOTE, GUARD_NOTE_EN, SEAL_NOTE_EN } from './busho_bank.js';
import { isEn, addEn } from '../i18n.js';
import { buyError } from '../paywall.js';   // K583：買えなかった時は字で知らせる（押しても何も起きないに見えない）

if (isEn()) import('./i18n_toyo.js').then((m) => addEn(m.default)).catch(() => {});
const MARK = { SS: '◆◆', S: '◆', A: '●', R: '▲', N: '■' };   // 格は色だけに頼らず形と字でも示す（画面の決まり）
// ---- レアごとの演出の差し込み口（K600：3D全身・専用の登場は別の係が setRevealHook(rank, fn) で差す）
//   fn(card, b, ctx)：card＝開く書状の要素・b＝その武将・ctx＝{ skip（一括・全部スキップ）, root（画面の要素）}。Promise を返せば終わるまで待つ。
//   既定は N・R・A＝演出なし（開く動きだけ）・S・SS＝暗い幕に名と格を出す（タップで飛ばせる・動きを減らす設定では出さない）。
//   見せる格は引いた本当の格だけ（偽の SS 演出は禁止・33）。
const reduceMotion = () => { try { return matchMedia('(prefers-reduced-motion:reduce)').matches; } catch (e) { return false; } };
const stageOf = (ms) => (card, b, ctx) => new Promise((done) => {
  if (ctx.skip || reduceMotion()) return done();
  const st = document.createElement('div'); st.className = `ty-stage r-${b.rank}`; st.setAttribute('role', 'img'); st.setAttribute('aria-label', `${b.rank} ${b.name}`);
  st.innerHTML = `<div class="sg-rk">${MARK[b.rank]} ${b.rank}</div><div class="sg-nm">${esc(b.name)}</div><div class="sg-hs">${HOUSE_NAME[b.house]}</div><button class="sg-skip" aria-label="飛ばす">▶▶</button>`;
  ctx.root.appendChild(st);
  const end = () => { clearTimeout(t); st.remove(); done(); };
  const t = setTimeout(end, ms); st.onclick = end;
});
export const REVEAL = { N: null, R: null, A: null, S: stageOf(2200), SS: stageOf(3200) };
export function setRevealHook(rank, fn) { REVEAL[rank] = fn; }
// K600（k600-engi）：3D 全身・家の型・SS 専用の登場（toyo_reveal.js）を差す。読めない時は上の既定の幕のまま
import('./toyo_reveal.js').then((R) => R.installReveal(setRevealHook)).catch(() => {});
const reveal = async (card, b, ctx) => { const f = REVEAL[b.rank]; if (f) { try { return await f(card, b, ctx); } catch (e) { /* 演出が落ちても登用は進む */ } } return null; };

// 主兵種（K601 3〜5）：槍・騎馬・鉄砲・弓。表の fav（得意の型）から読む。弓は小早川隆景のように名で決める。率いる兵はその兵種だけの約1000人
const ARM_BY_NAME = { 小早川隆景: '弓' };
export const armOf = (b) => b.arm || ARM_BY_NAME[b.name] || ({ teppo: '鉄砲', kiba: '騎馬', yari: '槍', shubi: '槍', std: '槍' }[b.fav || 'std'] || '槍');
const ARM_MARK = { 槍: '│', 騎馬: '♞', 鉄砲: '●', 弓: ')' };
const armChip = (b) => `<span class="ty-arm" aria-label="兵種 ${armOf(b)}"><i aria-hidden="true">${ARM_MARK[armOf(b)]}</i> <b>${armOf(b)}</b></span>`;
const infoLine = (b, tac) => `主兵種 ${armOf(b)}　率いる兵 ${armOf(b)}1000　Cost ${b.cost}${tac ? `　戦法 ${tac}` : ''}`;
const KATA_NAME = { std: '標準', yari: '槍', teppo: '鉄砲', kiba: '騎馬', shubi: '守備' };
const RCOL = { SS: '#e8c25a', S: '#d9824a', A: '#8fb0d8', R: '#9fc08a', N: '#b8ae9c' };
const pct = (v) => `${(v * 100).toFixed(v < 0.01 ? 2 : 1)}%`;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const CSS = `
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
.ty-btns{display:flex;gap:8px;flex-wrap:wrap}
.ty-btn{flex:1;min-width:130px;padding:6px 10px;border:1px solid #e8c77a;background:#5a1f17;text-align:center}
.ty-btn small{display:block;font-size:13px;opacity:.85}
.ty-btn.free{background:#24402a;border-color:#9fc08a}
.ty-btn.free.guide{box-shadow:0 0 0 2px #e8f0c0,0 0 18px 4px #c8e08a99}
@media (prefers-reduced-motion:no-preference){.ty-btn.free.guide{animation:tyGuide 1.6s ease-in-out infinite}@keyframes tyGuide{50%{box-shadow:0 0 0 2px #e8f0c0,0 0 26px 9px #c8e08acc}}}
.ty-btn:disabled{opacity:.45;cursor:default}
.ty-sub{display:flex;gap:8px}
.ty-sub button{flex:1;background:#0007;border:1px solid #8a7350;padding:4px 10px}
.ty-right{width:min(38%,300px);display:flex;flex-direction:column;gap:8px;min-height:0}
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
.ty-lt .op{width:100%;height:100%;background:linear-gradient(#f1e7cf,#ddcca6);border:1px solid #a8885a;box-shadow:0 8px 16px #000b;display:flex;gap:4px;padding:6px;text-align:left}
.ty-lt .op .bd{flex:0 0 46%;display:flex;align-items:flex-end;justify-content:center;background:radial-gradient(ellipse at 50% 70%,#fff6 0,#0000 70%);overflow:hidden;min-height:0}
.ty-lt .op .bd img{height:100%;max-height:none!important}
.ty-lt .op .in{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px;justify-content:center}
.ty-lt .op .rk{align-self:flex-start;font:700 15px/1.3 serif;padding:1px 8px;border:2px solid currentColor;background:#fff8}
.ty-lt .op .nm{font-size:20px;font-weight:700;letter-spacing:.06em;line-height:1.2;word-break:keep-all}
.ty-lt .op .hs{font-size:13px}
.ty-lt .op .ka{font-size:13px;color:#5a2a14;line-height:1.35}
.ty-lt .op .tag{font-size:12px;color:#7a2a1a}
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
.ty-note{font-size:13px;opacity:.85;margin:4px 0}
@media (prefers-reduced-motion:no-preference){.ty-card.open{animation:tyOpen .45s ease-out}@keyframes tyOpen{from{transform:rotateY(90deg)}to{transform:none}}}
`;

export function openToyo(root, o) {
  const st = o.state, banner = o.banner || {}, rng = o.rng || Math.random;
  if (!document.getElementById('toyo-css')) { const s = document.createElement('style'); s.id = 'toyo-css'; s.textContent = CSS; document.head.appendChild(s); }
  const el = document.createElement('div'); el.className = 'toyo'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', '武将登用');
  root.appendChild(el);
  const save = () => { try { o.onSave && o.onSave(st); } catch (e) { /* 持てなくても画面は進む */ } };
  import('./toyo_reveal.js').then((R) => R.prewarmReveal()).catch(() => {});   // K600：登場の 3D の素材を先に読む（書状を開いてから待たない）
  if (st.target && (banner.focus || []).includes(st.target)) banner.pickup = st.target;
  let pick = banner.pickup ? BUSHOU_BY_ID[banner.pickup] : null;
  // 11/21 K586（cloud-38）：武将の顔を裏で先に撮って端末に残す（SS から順に。一度撮れば次から撮らない）。書状を開いて1秒内に顔を出すため
  import('../busho_portrait.js').then((M) => { M.addPortraitRows(BUSHOU_ONLINE.map((b) => [b.name, b.house])); return M; }).then((M) => M.portraitPrewarm(BUSHOU_ONLINE.slice().sort((a, b) => 'SSANR'.indexOf(a.rank) - 'SSANR'.indexOf(b.rank)).map((b) => b.name))).catch(() => {});

  const left5 = () => { const n = Math.max(0, st.free | 0); return `<span class="ty-dots" role="img" aria-label="無料の登用 残り${n}回">${Array.from({ length: FREE_DAILY }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</span>`; };
  const web = !!o.webFree;   // web の版（購入の口が無い）：登用は無料で何回でも。小判も無料の回数も天井も減らさない
  const home = () => {
    const pl = pityLeft(st, banner), tk = st.tickets;
    const tks = [['sSelect', 'S 以上の選択券'], ['ssSelect', 'SS の選択券'], ['ssRandom', 'SS 確定券'], ['pickup', `${pick ? pick.name : ''}の確定券`]].filter(([k]) => tk[k] > 0);
    const out = st.free <= 0;
    el.innerHTML = `
      <div class="ty-top"><h1>武将登用</h1>
        ${web ? '' : `<span class="ty-chip">小判 ${st.kin.toLocaleString('ja-JP')}</span>
        <button class="ty-x" data-a="kin" aria-label="小判を購入">＋</button>`}<button class="ty-x" data-a="close" aria-label="閉じる">✕</button></div>
      ${(o.banners || []).length > 1 && o.onBanner ? `<div class="ty-focus" role="group" aria-label="登用の種類">${o.banners.map((x) => `<button data-a="bn" data-id="${esc(x.id)}" class="${x.id === banner.id ? 'on' : ''}" aria-pressed="${x.id === banner.id}">${esc(isEn() && x.en ? x.en : x.name)}</button>`).join('')}</div>` : ''}
      <div class="ty-main"><div class="ty-left">
        <div class="ty-banner">${pick ? `<div>${banner.name ? `${esc(isEn() && banner.en ? banner.en : banner.name)}${banner.until && banner.until.label ? `　<span>${esc(banner.until.label)}</span>` : ''}` : '登用の頼み状'}</div><b>${esc(pick.name)}</b>　<span>${MARK[pick.rank]} ${pick.rank}・${HOUSE_NAME[pick.house]}</span>` : '<b>武将登用</b>'}
          <div class="ty-pity"${web ? ' hidden' : ''}>
            ${pick ? `<span>${esc(pick.name)}確定まで 残り <strong>${pl.pickupLeft}</strong>回</span>` : ''}
            <span>${st.pity < 80 ? 'SS確定まで' : `${pl.next.label}まで`} <strong>${st.pity}/${st.pity < 80 ? 80 : pl.next.at}</strong></span>
          </div>
          <div class="ty-note">書状を三通開き、三人から一人を登用します。</div>
          ${(banner.focus || []).length > 1 ? `<div class="ty-focus" role="group" aria-label="目当ての武将">${banner.focus.map((id) => `<button data-a="focus" data-id="${id}" class="${id === banner.pickup ? 'on' : ''}" aria-pressed="${id === banner.pickup}">${esc(BUSHOU_BY_ID[id].name)}</button>`).join('')}</div>` : ''}
          <div class="ty-note ty-use">登用した武将はオンライン対戦で使用します</div></div>
        ${web ? `<div class="ty-btns"><button class="ty-btn free guide" data-a="wone">登用する<small>web 版は無料で登用できます</small></button><button class="ty-btn" data-a="wten">十回登用<small>無料</small></button></div>` : `<div class="ty-btns">
          <button class="ty-btn free${st.free > 0 && !(st.log || []).length ? ' guide' : ''}" data-a="free" ${out ? 'disabled' : ''}>無料で登用<small>${left5()} 今日の残り ${st.free}回</small></button>
          <button class="ty-btn" data-a="one">追加登用 1回<small>小判 ${PRICE.one}</small></button>
          <button class="ty-btn" data-a="ten">追加登用 10回<small>小判 ${PRICE.ten.toLocaleString('ja-JP')}</small></button>
        </div>`}
        ${web ? '' : out ? `<p class="ty-note ty-out" role="status">本日の無料登用を使い切りました。追加登用 1回 小判${PRICE.one}／10回 小判${PRICE.ten.toLocaleString('ja-JP')}</p>` : ''}
        <div class="ty-sub"><button data-a="rates">提供割合</button><button data-a="hist">登用履歴</button>${o.onKoukan ? '<button data-a="koukan">交換所</button>' : ''}</div>
      </div><div class="ty-right">
        ${tks.map(([k, n]) => `<div class="ty-tk">${n}（${tk[k]}枚）<button data-a="tk" data-k="${k}">${k === 'ssRandom' ? '使って登用する' : '武将を選んで登用する'}</button></div>`).join('')}
        <div class="ty-tk">持っている武将 ${Object.keys(st.owned).length}人・武将印 ${st.seals}</div>
      </div></div>`;
  };

  // 書状三通 → 一通ずつ開く（［一括開封］もある）→ 三人から一人を選ぶ。十回は一覧（各組から一人）
  const bestIdx = (set) => { let bi = -1, br = 2; set.forEach((b, i) => { const r = 'NRASS'.indexOf(b.rank === 'SS' ? 'SS' : b.rank); const v = b.rank === 'SS' ? 4 : b.rank === 'S' ? 3 : b.rank === 'A' ? 2 : -1; if (v >= 3 && v > br) { br = v; bi = i; } }); return bi; };
  const draw = (sets, got, k0 = 0, debut = null) => {
    if (sets.length - k0 > 1) return drawTen(sets, got, k0);
    import('../busho_portrait.js').then((M) => { for (const set of sets) for (const b of set) M.portrait(b.name); }).catch(() => {});
    const k = k0, set = sets[k], opened = [false, false, false]; let busy = false;
    const allOpen = () => opened.every(Boolean);
    const hint = bestIdx(set);   // 三人に S 以上がいる時だけ、一通に特別な封（気配）。見せかけは無い：その一通は本当に最高の格
    const ov = () => {
      const rec = recommend(set, st, banner);
      el.innerHTML = `<div class="ty-ov jo"><h2>登用${got.length ? `　<span style="color:#f3d68a">${got.map((g) => g.label).join('・')}が届いた</span>` : ''}${debut === 'S' ? '　<span style="color:#f3d68a">初陣登用：S の武将から一人を選べます</span>' : debut === 'A' ? '　<span style="color:#f3d68a">初陣登用</span>' : ''}</h2>
        <div class="ty-desk">${set.map((b, i) => `<button class="ty-lt r-${b.rank}${!opened[i] && i === hint ? ' aura' : ''}" data-a="card" data-i="${i}" aria-label="${opened[i] ? `${b.rank} ${b.name}` : `書状 ${i + 1}${i === hint ? '（特別な封）' : ''}`}">
          ${opened[i] ? `<div class="op"><div class="bd" data-busho-body="${esc(b.name)}"></div><div class="in">
              <span class="rk" style="color:${RCOL[b.rank] === '#e8c25a' ? '#8a5a08' : b.rank === 'S' ? '#9a4a1a' : '#3a2a18'}">${MARK[b.rank]} ${b.rank}</span>
              <span class="nm">${esc(b.name)}</span><div data-busho-art="${esc(b.name)}"></div>
              <span class="hs">${armChip(b)}　${HOUSE_NAME[b.house]}</span><span class="ka" data-kata="${esc(b.name)}" data-fav="${b.fav || 'std'}">得意：${KATA_NAME[b.fav || 'std'] || '標準'}</span>
              ${b.id === banner.pickup ? '<span class="tag">目当ての武将</span>' : ''}${st.owned[b.id] ? '<span class="tag">持っている（武将印へ）</span>' : ''}${allOpen() ? `<span class="pickb" role="button" data-a="pick" data-i="${i}">登用する</span>` : ''}</div></div>`
          : `<div class="fold"><span class="ti">書状</span><span class="fu">${i === hint ? '◆' : '封'}</span></div>`}</button>`).join('')}</div>
        <div class="ty-foot">${!allOpen() ? '<button data-a="all">一括開封</button>' : '<button class="sec" data-a="no3">登用しない</button>'}</div>
        <p class="ty-note" style="text-align:center">${allOpen() ? '三人から一人を選びます。選ばなかった二人は今回は見送りです' : '書状を一通ずつ開きます'}</p></div>`;
      if (opened.some(Boolean)) import('../bushou_card_art.js').then((A) => A.fillCardArt(el)).catch(() => {});
      import('./toyo_reveal.js').then((R) => R.fillBodies(el)).catch(() => {});   // K600：札の全身（[data-busho-body]）
      // 型の一行（得意の兵種・固有戦術の名）＝「この武将でこういう戦い方」
      if (opened.some(Boolean)) import('./tactics.js').then((T) => { for (const n of el.querySelectorAll('[data-kata]')) { const t = T.TACTICS[T.BUSHO_TACTIC[n.dataset.kata]] || T.PASSIVES?.[T.BUSHO_PASSIVE?.[n.dataset.kata]]; if (t) n.textContent = `得意：${KATA_NAME[n.dataset.fav] || '標準'}・${t.name}`; } }).catch(() => {});
    };
    const openOne = async (i, skip) => {
      if (opened[i]) return;
      const card = el.querySelector(`[data-i="${i}"]`);
      await reveal(card, set[i], { skip, root: el.querySelector('.ty-ov') || el });
      opened[i] = true;
    };
    const take = (i) => { const r = choosePending(st, k, set[i], banner) || { b: set[i], dup: false, seal: 0 }; save(); done([r]); };
    const handler = async (e) => {
      const b = e.target.closest('[data-a]'); if (!b || busy) return;
      const a = b.dataset.a;
      if (a === 'card') { const i = +b.dataset.i; if (!opened[i]) { busy = true; await openOne(i, false); busy = false; ov(); } }
      else if (a === 'pick') { if (allOpen()) take(+b.dataset.i); }
      else if (a === 'all') { busy = true; for (let i = 0; i < 3; i++) await openOne(i, true); busy = false; ov(); }
      else if (a === 'rec') take(+b.dataset.i);
      else if (a === 'no3') {
        el.innerHTML = `<div class="ty-ov"><h2>この三人からは登用しません</h2><div class="ty-scroll"><p class="ty-note">登用の回数は使われます。三人とも見送ると、この組はもう選べません。</p></div>
          <div class="ty-foot"><button data-a="no3y">登用しない</button><button class="sec" data-a="no3n">戻って選ぶ</button></div></div>`;
      } else if (a === 'no3y') { declinePending(st, k); save(); bind(); }
      else if (a === 'no3n') ov();
    };
    // 暗転 → 使者：短く（タップで飛ばせる・動きを減らす設定では出さない）
    if (reduceMotion()) return ov();
    el.innerHTML = '<div class="ty-ov jo" style="align-items:center;justify-content:center;cursor:pointer"><div style="font-size:20px;letter-spacing:.2em;color:#e8c77a;text-shadow:0 2px 6px #000;background:#0009;padding:8px 18px;border:1px solid #8a7350">使者が 書状を三通 届けました</div></div>';
    let went = false; const go = () => { if (went) return; went = true; el.onclick = handler; ov(); };
    el.onclick = go; setTimeout(go, 900);
  };
  // 十回：三人の組を十行に並べ、各行から一人を選ぶ。N・R は一覧のまま速く、S 以上の行は枠で目立たせる。［全部スキップ］＝おすすめで全部選ぶ
  const drawTen = (sets, got, k0) => {
    const rows = sets.slice(k0), choice = rows.map(() => -1);
    import('../busho_portrait.js').then((M) => { for (const set of rows) for (const b of set) M.portrait(b.name); }).catch(() => {});
    const commit = () => {
      const res = rows.map((set, r) => choosePending(st, k0 + r, set[choice[r] >= 0 ? choice[r] : recommend(set, st, banner)], banner)).filter(Boolean);
      save(); done(res);
    };
    const ov = () => {
      const all = choice.every((c) => c >= 0);
      el.innerHTML = `<div class="ty-ov"><h2>十回登用${got.length ? `　<span style="color:#f3d68a">${got.map((g) => g.label).join('・')}が届いた</span>` : ''}</h2>
        <div class="ty-scroll"><div class="ty-rows">${rows.map((set, r) => `<div class="ty-row"><span>${r + 1}</span>${set.map((b, i) => `<button data-a="c" data-r="${r}" data-i="${i}" class="${b.rank === 'S' || b.rank === 'SS' ? 'hi' : ''} ${choice[r] === i ? 'pk' : ''}" aria-pressed="${choice[r] === i}" aria-label="${r + 1}組目 ${b.rank} ${b.name}">${MARK[b.rank]} ${esc(b.name)}${st.owned[b.id] ? ' ・印' : ''}</button>`).join('')}</div>`).join('')}</div></div>
        <p class="ty-note" style="text-align:center">各組から一人を選びます（${choice.filter((c) => c >= 0).length}／${rows.length}）</p>
        <div class="ty-foot"><button data-a="ok" ${all ? '' : 'disabled'}>この十人で登用する</button><button class="sec" data-a="skip">全部スキップ</button></div></div>`;
    };
    el.onclick = (e) => {
      const b = e.target.closest('[data-a]'); if (!b || b.disabled) return;
      if (b.dataset.a === 'c') { const r = +b.dataset.r; choice[r] = +b.dataset.i; const sc = el.querySelector('.ty-scroll')?.scrollTop; ov(); const n = el.querySelector('.ty-scroll'); if (n) n.scrollTop = sc || 0; }
      else if (b.dataset.a === 'ok' || b.dataset.a === 'skip') commit();
    };
    ov();
  };
  // 登用の結果：「〇〇を登用しました［軍団に編成］［模擬合戦で試す］［詳細を見る］［続けて登用］」（K598・K600 36〜37）。重なれば武将印へ（51〜53）
  const done = (results) => {
    const bs = results.map((r) => r.b);
    const one = bs.length === 1, b0 = bs[0];
    const firstS = one && (b0.rank === 'S' || b0.rank === 'SS') && !st.firstS;   // 最初の S 以上：そのまま模擬合戦へ（96）
    if (firstS) { st.firstS = 1; save(); }
    const dupNote = (r) => (r.dup ? `すでに登用済みです。武将印 ${r.seal} に変えました` : '');
    el.innerHTML = `<div class="ty-ov"><h2>${one ? `${esc(b0.name)}を登用しました` : `${bs.length}人を登用しました`}</h2>
      ${one ? `<div class="ty-cards"><div class="ty-got" style="flex:2.2;min-width:0;position:relative;border:1px solid #5a4a32;border-radius:4px;overflow:hidden;background:#0006" aria-label="${esc(b0.name)}と率いる${armOf(b0)}の隊"></div><div class="ty-card open"><span class="rk">${MARK[b0.rank]} ${b0.rank}</span><span class="nm">${esc(b0.name)}</span><div data-busho-art="${esc(b0.name)}" data-face="1"></div><span class="hs">${HOUSE_NAME[b0.house]}・コスト${b0.cost}</span></div></div>
        <p class="ty-note" style="text-align:center" id="ty-info">${infoLine(b0, null)}</p>${results[0].dup ? `<p class="ty-note" role="status" style="text-align:center">${dupNote(results[0])}</p>` : ''}`
      : `<div class="ty-scroll"><table class="ty-tbl">${results.map((r, i) => `<tr><td>${i + 1}</td><td>${MARK[r.b.rank]} ${r.b.rank}</td><td>${esc(r.b.name)}</td><td>${HOUSE_NAME[r.b.house]}</td><td>${r.dup ? `武将印 +${r.seal}` : '新しく登用'}</td></tr>`).join('')}</table></div>`}
      <p class="ty-note ty-use">登用した武将はオンライン対戦で使用します</p>
      <div class="ty-foot" style="flex-wrap:wrap">${firstS && o.onTrial ? `<button data-a="trial">模擬合戦で試す</button>` : ''}${o.onFormArmy ? '<button data-a="army">軍団に入れる</button>' : ''}${one && !firstS && o.onTrial ? '<button data-a="trial" class="sec">模擬合戦で試す</button>' : ''}${one ? '<button data-a="detail" class="sec">詳細を見る</button>' : ''}<button data-a="more" class="sec">続けて登用</button><button class="sec" data-a="back">戻る</button></div></div>`;
    if (one) {
      import('../bushou_card_art.js').then((A) => A.fillCardArt(el)).catch(() => {});
      import('./tactics.js').then((T) => { const t = T.TACTICS[T.BUSHO_TACTIC[b0.name]]; const n = el.querySelector('#ty-info'); if (n) n.textContent = infoLine(b0, t ? t.name : 'なし'); }).catch(() => {});
    }
    // K601 54〜55（k600-engi）：取った武将の全身3D＋背後にその主兵種の隊（滝川＝鉄砲隊・山県＝赤備えの騎馬）。画面を離れる時に捨てる
    let got = null;
    if (one) import('./toyo_reveal.js').then((R) => { const g = el.querySelector('.ty-got'); if (g && g.isConnected) got = R.mountBushouStage(g, b0, { n: b0.rank === 'S' || b0.rank === 'SS' ? 110 : 70, nobori: 30 }); }).catch(() => {});
    el.onclick = (e) => {
      const b = e.target.closest('[data-a]'); if (!b) return;
      const a = b.dataset.a;
      got?.dispose(); got = null;
      if (a === 'army') { el.remove(); o.onFormArmy(); }
      else if (a === 'trial') { el.remove(); o.onTrial(b0.id); }
      else if (a === 'detail') detail(b0, () => done(results));
      else bind();
    };
  };
  // 武将の詳細（K600 8・12 の一部）：格・家・コスト・得意の兵種・固有戦術。3D 全身と能力・おすすめ配置は後の係が足す
  const detail = (b, back) => {
    // K601 11〜18（k600-engi）：大きな3D全身＋右に情報・タブ［能力］［戦法］［家宝］［戦歴］・主兵種・率いる部隊（toyo_detail.js）
    el.onclick = null;
    el.innerHTML = '<div class="ty-ov"></div>';
    import('./toyo_detail.js').then((D) => D.openBushouDetail(el.querySelector('.ty-ov'), b, { arm: armOf(b), onBack: back, onTrial: o.onTrial ? () => { el.remove(); o.onTrial(b.id); } : null })).catch(() => back());
  };
  // 登用履歴（K600 91）：直近の結果と天井の進み
  const hist = () => {
    const pl = pityLeft(st, banner);
    el.innerHTML = `<div class="ty-ov"><h2>登用履歴</h2><div class="ty-scroll">
      <p class="ty-note">天井：${pl.next.label}まで ${st.pity}/${pl.next.at}${pick ? `・${esc(pick.name)}の確定まで ${st.pickupPity}/${PICKUP_AT}` : ''}。注目の期間が終わっても、同じ種類の登用へ引き継ぎます。</p>
      ${(st.log || []).length ? `<table class="ty-tbl">${st.log.slice(-20).reverse().map((id, i) => { const b = BUSHOU_BY_ID[id]; return b ? `<tr><td>${i + 1}</td><td>${MARK[b.rank]} ${b.rank}</td><td>${esc(b.name)}</td><td>${HOUSE_NAME[b.house]}</td></tr>` : ''; }).join('')}</table>` : '<p class="ty-note">まだ登用していません</p>'}</div>
      <div class="ty-foot"><button class="sec" data-a="back">戻る</button></div></div>`;
    el.onclick = (e) => { if (e.target.closest('[data-a="back"]')) bind(); };
  };
  // 確率の表（一人ごと・三人のどれかに）と天井
  const rates = () => {
    const P = rateTable('paid', banner), F = rateTable('free', banner);
    const tb = (t, title) => `<h2 style="margin-top:6px">${title}</h2><table class="ty-tbl"><tr><th>格</th><th>一人ごと</th><th>三人のどれかに</th><th>人数</th><th>一人あたり</th></tr>
      ${t.rows.map((r) => `<tr><td>${MARK[r.rank]} ${r.rank}</td><td>${pct(r.each)}</td><td>${pct(r.any)}</td><td>${r.n}人</td><td>${r.pickPer ? `${esc(pick.name)} ${pct(r.pickPer)}・ほか ${pct(r.per)}` : pct(r.per)}</td></tr>`).join('')}</table>`;
    el.innerHTML = `<div class="ty-ov"><h2>提供割合</h2><div class="ty-scroll">
      ${tb(P, `追加登用（1回 小判${PRICE.one}・10回 小判${PRICE.ten.toLocaleString('ja-JP')}）`)}
      <p class="ty-note">初陣登用：始めて最初の10組のうちに A 以上の候補が一度は入ります。20組目の候補は S の三人です。</p><p class="ty-note">登用した武将はオンライン対戦で使用します。三人の候補は一人ずつ別に引きます。三人のどれかに SS が出る率 ${pct(P.anySS)}・S 以上 ${pct(P.anySUp)}。</p>
      ${pick ? `<p class="ty-note">SS が出た時、その半分は ${esc(pick.name)}。${esc(pick.name)}を登用せずに ${PICKUP_AT}回で、${esc(pick.name)}の確定券が届きます。</p>` : ''}
      <p class="ty-note">天井（追加登用の回数）：${PITY.map((p) => `${p.at}回＝${p.label}`).join('・')}。120回で一巡し、数えは0へ戻ります。</p>
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
  const onPrices = () => { if (!el.isConnected) { window.removeEventListener('risshin-kin-prices', onPrices); return; } if (kinView) kin(kinView.need, kinView.msg); };
  window.addEventListener('risshin-kin-prices', onPrices);
  const kin = (need, msg = '') => {
    o.refreshPrices?.();
    kinView = { need, msg };
    // 価格は App Store の値（o.priceOf）が正。届くまでの既定の円は日本語の端末だけに出し、ほかの国の店では円を出さない（3.1.1・2.3.10：値段の食い違い）
    const jaLocale = (() => { try { return /^ja/i.test(navigator.language || 'ja'); } catch (e) { return true; } })();
    const yen = (f) => (o.kinState && o.kinState(f.id) === 'missing') ? '' : (o.priceOf && o.priceOf(f.id)) || (jaLocale ? `¥${f.yen.toLocaleString('ja-JP')}` : '価格は購入の画面に表示');
    el.innerHTML = `<div class="ty-ov"><h2>小判を購入${need ? `（あと ${need.toLocaleString('ja-JP')} 足りません）` : ''}</h2><div class="ty-scroll"><div class="ty-packs">
      ${PACKS.map((p) => `<button class="${p.best ? 'best' : ''} ${p.quiet ? 'quiet' : ''}" data-a="buy" data-id="${p.id}">小判 ${p.kin.toLocaleString('ja-JP')}${p.firstBonus && !st.bought[p.id] ? `<br><small>初めての時は ＋${p.firstBonus}</small>` : ''}<br>${yen(p)}</button>`).join('')}</div>
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
      ${list.map((b) => `<button data-a="pick" data-id="${b.id}">${MARK[b.rank]} ${b.rank}<br><b>${esc(b.name)}</b><br><small>${HOUSE_NAME[b.house]}${st.owned[b.id] ? '・持っている' : ''}</small></button>`).join('')}</div></div>
      <div class="ty-foot"><button class="sec" data-a="back">選ばずに戻る</button></div></div>`;
    el.onclick = (e) => {
      const b = e.target.closest('[data-a]'); if (!b) return;
      if (b.dataset.a === 'pick') { const r = useTicket(st, kind, rng, b.dataset.id, banner); save(); if (r) return done([r]); }
      bind();
    };
  };

  const bind = () => {
    kinView = null;
    home();
    el.onclick = (e) => {
      const b = e.target.closest('[data-a]'); if (!b || b.disabled) return;
      const a = b.dataset.a;
      if (a === 'close') { el.remove(); o.onClose && o.onClose(); return; }
      if (a === 'bn') { if (b.dataset.id !== banner.id) o.onBanner(b.dataset.id); return; }
      if (a === 'rates') return rates();
      if (a === 'hist') return hist();
      if (a === 'focus') { st.target = b.dataset.id; banner.pickup = st.target; pick = BUSHOU_BY_ID[st.target]; save(); return bind(); }
      if (a === 'koukan') return o.onKoukan(bind);  // 33 の交換所。閉じたら武将印の数を描き直す
      if (a === 'kin') return kin(0);
      if (a === 'tk') return ticket(b.dataset.k);
      const run = () => {
        const r = a === 'free' ? pull(st, 'free', 1, rng, banner) : a === 'one' ? pull(st, 'paid', 1, rng, banner) : a === 'ten' ? pull(st, 'paid', 10, rng, banner) : null;
        if (!r) return;
        if (!r.ok) return r.why === 'kin' ? lack(r.need) : bind();
        save(); draw(r.sets, r.got, 0, r.debut);
      };
      if (a === 'wone' || a === 'wten') {
        const n = a === 'wten' ? 10 : 1, keep = { kin: st.kin, free: st.free, pity: st.pity, pp: st.pickupPity, tk: { ...st.tickets }, dn: st.debutN, ds: st.debutSeen };
        st.kin = (st.kin || 0) + PRICE.ten;
        const r = pull(st, 'paid', n, rng, banner);
        st.kin = keep.kin; st.free = keep.free; st.pity = keep.pity; st.pickupPity = keep.pp; st.tickets = keep.tk; st.debutN = keep.dn; st.debutSeen = keep.ds;
        if (!r || !r.ok) return;
        save(); return draw(r.sets, [], 0, null);
      }
      if (a === 'one' || a === 'ten') return ask(a, run);   // 有料は確認札をはさむ
      run();
    };
  };
  bind();
  if (o.startAt === 'kin') kin(0);   // ホームの金の『＋』から（48 の hooks.kin）は買い場から開く
  // 選び終える前に閉じた組があれば、その続きから（金と天井はもう数えてある）
  { const pd = pendingSets(st); if (pd) draw(pd.sets, pd.got, pd.k); }
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
