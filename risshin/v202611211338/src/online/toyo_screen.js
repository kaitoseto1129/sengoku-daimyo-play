// 武将登用の画面（K588・docs/gacha_price_1120.md・online_req 18〜22／100「城・使者・書状。書状三通を開き、三人から一人を登用」・クラウド kaito2 k365-cloud-27・11/21）。
//   openToyo(root, o) で root の上に開く。o：{ state（toyo_rules の newToyoState）, banner（{ pickup, event, name }）, rng, onClose, onSave, buyKin(pack) }
//   本番は抽選と持ち物をサーバー（K589 Cloudflare Workers）が持つ。この画面は toyo_rules.js の関数を呼ぶだけなので、サーバーの返事に替えても形は同じ。
//   売り方の決まり（紙）：売るのはオンラインのホームと、この画面だけ。SS が出なかった後の「あと1回！」は出さない。確率と天井の残りはいつも見える所に置く。
import { PRICE, FREE_DAILY, PITY, PICKUP_AT, PACKS, pull, choose, choosePending, pendingSets, creditPurchase, recommend, rateTable, pityLeft, ticketChoices, useTicket } from './toyo_rules.js';
import { BUSHOU_BY_ID, HOUSE_NAME, BUSHOU_ONLINE } from './bushou_online.js';
import { GUARD_NOTE, SEAL_NOTE } from './busho_bank.js';
import { buyError } from '../paywall.js';   // K583：買えなかった時は字で知らせる（押しても何も起きないに見えない）

const MARK = { SS: '◆◆', S: '◆', A: '●', R: '▲', N: '■' };   // 格は色だけに頼らず形と字でも示す（画面の決まり）
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
.ty-left{flex:1;display:flex;flex-direction:column;justify-content:space-between;min-width:0}
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
.toyo .ty-card{flex:1;max-width:230px;position:relative;border:1px solid #b8955a;background:linear-gradient(#efe4c8,#d9c9a2);color:#2a1d12;border-radius:3px;padding:10px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;text-align:center}
.ty-card .rk{font:700 22px/1 serif;letter-spacing:.05em}
.ty-card .nm{font-size:24px;font-weight:700;writing-mode:vertical-rl;letter-spacing:.15em;min-height:5.2em}
.ty-card .hs{font-size:14px}
.ty-card.sealed{background:linear-gradient(#e9dcbc,#cdb98d)}
.ty-card.sealed .nm{opacity:0}
.ty-card .seal{position:absolute;inset:auto 0 46% 0;font-size:16px;color:#7a2a1a}
.ty-card.pick{outline:3px solid #e8c77a;outline-offset:2px}
.ty-card.left{opacity:.45}
.ty-card .tag{font-size:13px;color:#7a2a1a}
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
.ty-note{font-size:13px;opacity:.85;margin:4px 0}
@media (prefers-reduced-motion:no-preference){.ty-card.open{animation:tyOpen .45s ease-out}@keyframes tyOpen{from{transform:rotateY(90deg)}to{transform:none}}}
`;

export function openToyo(root, o) {
  const st = o.state, banner = o.banner || {}, rng = o.rng || Math.random;
  if (!document.getElementById('toyo-css')) { const s = document.createElement('style'); s.id = 'toyo-css'; s.textContent = CSS; document.head.appendChild(s); }
  const el = document.createElement('div'); el.className = 'toyo'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', '武将登用');
  root.appendChild(el);
  const save = () => { try { o.onSave && o.onSave(st); } catch (e) { /* 持てなくても画面は進む */ } };
  const pick = banner.pickup ? BUSHOU_BY_ID[banner.pickup] : null;
  // 11/21 K586（cloud-38）：武将の顔を裏で先に撮って端末に残す（SS から順に。一度撮れば次から撮らない）。書状を開いて1秒内に顔を出すため
  import('../busho_portrait.js').then((M) => { M.addPortraitRows(BUSHOU_ONLINE.map((b) => [b.name, b.house])); return M; }).then((M) => M.portraitPrewarm(BUSHOU_ONLINE.slice().sort((a, b) => 'SSANR'.indexOf(a.rank) - 'SSANR'.indexOf(b.rank)).map((b) => b.name))).catch(() => {});

  const left5 = () => { const n = Math.max(0, st.free | 0); return `<span class="ty-dots" role="img" aria-label="無料の登用 残り${n}回">${Array.from({ length: FREE_DAILY }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</span>`; };
  const home = () => {
    const pl = pityLeft(st, banner), tk = st.tickets;
    const tks = [['sSelect', 'S 以上の選択券'], ['ssSelect', 'SS の選択券'], ['ssRandom', 'SS 確定券'], ['pickup', `${pick ? pick.name : ''}の確定券`]].filter(([k]) => tk[k] > 0);
    const out = st.free <= 0;
    el.innerHTML = `
      <div class="ty-top"><h1>武将登用</h1>
        <span class="ty-chip">小判 ${st.kin.toLocaleString('ja-JP')}</span>
        <button class="ty-x" data-a="kin" aria-label="小判を購入">＋</button><button class="ty-x" data-a="close" aria-label="閉じる">✕</button></div>
      <div class="ty-main"><div class="ty-left">
        <div class="ty-banner">${pick ? `<div>登用の頼み状</div><b>${esc(pick.name)}</b>　<span>${MARK[pick.rank]} ${pick.rank}・${HOUSE_NAME[pick.house]}</span>` : '<b>武将登用</b>'}
          <div class="ty-pity">
            ${pick ? `<span>${esc(pick.name)}確定まで 残り <strong>${pl.pickupLeft}</strong>回</span>` : ''}
            <span>${pl.next.label}まで 残り <strong>${pl.left}</strong>回</span>
          </div>
          <div class="ty-note">書状を三通開き、三人から一人を登用します。</div>
          <div class="ty-note ty-use">登用した武将はオンライン対戦で使用します</div></div>
        <div class="ty-btns">
          <button class="ty-btn free${st.free > 0 && !(st.log || []).length ? ' guide' : ''}" data-a="free" ${out ? 'disabled' : ''}>無料で登用<small>${left5()} 今日の残り ${st.free}回</small></button>
          <button class="ty-btn" data-a="one">追加登用 1回<small>小判 ${PRICE.one}</small></button>
          <button class="ty-btn" data-a="ten">追加登用 10回<small>小判 ${PRICE.ten.toLocaleString('ja-JP')}</small></button>
        </div>
        ${out ? `<p class="ty-note ty-out" role="status">本日の無料登用を使い切りました。追加登用 1回 小判${PRICE.one}／10回 小判${PRICE.ten.toLocaleString('ja-JP')}</p>` : ''}
        <div class="ty-sub"><button data-a="rates">提供割合</button>${o.onKoukan ? '<button data-a="koukan">交換所</button>' : ''}</div>
      </div><div class="ty-right">
        ${tks.map(([k, n]) => `<div class="ty-tk">${n}（${tk[k]}枚）<button data-a="tk" data-k="${k}">${k === 'ssRandom' ? '使って登用する' : '武将を選んで登用する'}</button></div>`).join('')}
        <div class="ty-tk">持っている武将 ${Object.keys(st.owned).length}人・武将印 ${st.seals}</div>
      </div></div>`;
  };

  // 書状三通 → 開く → 一人を選ぶ。sets を順に（十回は十組）。done で home へ
  const draw = (sets, got, k0 = 0) => {
    let k = k0, chosen = null, opened = false;
    // 引いた武将の顔を、書状を開く前に先に撮る（列の先頭へ）
    import('../busho_portrait.js').then((M) => { for (const set of sets) for (const b of set) M.portrait(b.name); }).catch(() => {});
    const ov = () => {
      const set = sets[k], rec = recommend(set, st, banner);
      el.innerHTML = `<div class="ty-ov"><h2>${sets.length > 1 ? `十回登用　${k + 1}／${sets.length}組` : '登用'}${got.length && k === 0 ? `　<span style="color:#f3d68a">${got.map((g) => g.label).join('・')}が届いた</span>` : ''}</h2>
        <div class="ty-cards">${set.map((b, i) => `<button class="ty-card ${opened ? 'open' : 'sealed'} ${chosen === i ? 'pick' : chosen !== null ? 'left' : ''}" data-a="card" data-i="${i}" aria-label="${opened ? `${b.rank} ${b.name}` : `書状 ${i + 1}`}">
          ${opened ? `<span class="rk" style="color:${b.rank === 'SS' ? '#8a5a08' : '#3a2a18'}">${MARK[b.rank]} ${b.rank}</span><span class="nm">${esc(b.name)}</span><div data-busho-art="${esc(b.name)}" data-face="1"></div><span class="hs">${HOUSE_NAME[b.house]}・コスト${b.cost}</span>
            ${b.id === banner.pickup ? '<span class="tag">頼み状の武将</span>' : ''}${st.owned[b.id] ? '<span class="tag">持っている（武将印へ）</span>' : ''}${chosen !== null && chosen !== i ? '<span class="tag">今回は見送り</span>' : ''}`
          : '<span class="seal">書状</span><span class="nm">　</span>'}</button>`).join('')}</div>
        <div class="ty-foot">${!opened ? '<button data-a="open">書状を開く</button>' + (sets.length > 1 ? '<button class="sec" data-a="auto">おすすめを自動で選ぶ</button>' : '')
          : chosen === null ? `<button class="sec" data-a="rec" data-i="${rec}">おすすめ（${esc(set[rec].name)}）を登用する</button>`
          : `<button data-a="next">${k + 1 < sets.length ? '次の組へ' : '結果を見る'}</button>`}</div></div>`;
      if (opened) import('../bushou_card_art.js').then((A) => A.fillCardArt(el)).catch(() => {});   // 11/21 K586（cloud-38）：開いた書状に顔・家紋・旗印
    };
    const take = (i) => { if (chosen !== null) return; chosen = i; choosePending(st, k, sets[k][i], banner); save(); ov(); };
    el.onclick = (e) => {
      const b = e.target.closest('[data-a]'); if (!b) return;
      const a = b.dataset.a;
      if (a === 'open') { opened = true; ov(); }
      else if (a === 'card' && opened) take(+b.dataset.i);
      else if (a === 'rec') take(+b.dataset.i);
      else if (a === 'next') { if (++k < sets.length) { chosen = null; opened = false; ov(); } else done(st.log.slice(-sets.length)); }
      else if (a === 'auto') { const n = sets.length - k; for (; k < sets.length; k++) choosePending(st, k, sets[k][recommend(sets[k], st, banner)], banner); save(); done(st.log.slice(-sets.length)); }
    };
    ov();
  };
  // 登用の結果：「〇〇を登用しました［軍団に編成］［続けて登用］［戻る］」（K598）
  const done = (ids) => {
    const bs = ids.map((id) => BUSHOU_BY_ID[id]).filter(Boolean);
    const one = bs.length === 1;
    el.innerHTML = `<div class="ty-ov"><h2>${one ? `${esc(bs[0].name)}を登用しました` : `${bs.length}人を登用しました`}</h2>
      ${one ? `<div class="ty-cards"><div class="ty-card open"><span class="rk">${MARK[bs[0].rank]} ${bs[0].rank}</span><span class="nm">${esc(bs[0].name)}</span><div data-busho-art="${esc(bs[0].name)}" data-face="1"></div><span class="hs">${HOUSE_NAME[bs[0].house]}・コスト${bs[0].cost}</span></div></div>`
      : `<div class="ty-scroll"><table class="ty-tbl">${bs.map((b, i) => `<tr><td>${i + 1}</td><td>${MARK[b.rank]} ${b.rank}</td><td>${esc(b.name)}</td><td>${HOUSE_NAME[b.house]}</td></tr>`).join('')}</table></div>`}
      <p class="ty-note ty-use">登用した武将はオンライン対戦で使用します</p>
      <div class="ty-foot">${o.onFormArmy ? '<button data-a="army">軍団に編成</button>' : ''}<button data-a="more">続けて登用</button><button class="sec" data-a="back">戻る</button></div></div>`;
    if (one) import('../bushou_card_art.js').then((A) => A.fillCardArt(el)).catch(() => {});
    el.onclick = (e) => {
      const b = e.target.closest('[data-a]'); if (!b) return;
      if (b.dataset.a === 'army') { el.remove(); o.onFormArmy(); } else bind();
    };
  };
  // 確率の表（一人ごと・三人のどれかに）と天井
  const rates = () => {
    const P = rateTable('paid', banner), F = rateTable('free', banner);
    const tb = (t, title) => `<h2 style="margin-top:6px">${title}</h2><table class="ty-tbl"><tr><th>格</th><th>一人ごと</th><th>三人のどれかに</th><th>人数</th><th>一人あたり</th></tr>
      ${t.rows.map((r) => `<tr><td>${MARK[r.rank]} ${r.rank}</td><td>${pct(r.each)}</td><td>${pct(r.any)}</td><td>${r.n}人</td><td>${r.pickPer ? `${esc(pick.name)} ${pct(r.pickPer)}・ほか ${pct(r.per)}` : pct(r.per)}</td></tr>`).join('')}</table>`;
    el.innerHTML = `<div class="ty-ov"><h2>提供割合</h2><div class="ty-scroll">
      ${tb(P, `追加登用（1回 小判${PRICE.one}・10回 小判${PRICE.ten.toLocaleString('ja-JP')}）`)}
      <p class="ty-note">登用した武将はオンライン対戦で使用します。三人の候補は一人ずつ別に引きます。三人のどれかに SS が出る率 ${pct(P.anySS)}・S 以上 ${pct(P.anySUp)}。</p>
      ${pick ? `<p class="ty-note">SS が出た時、その半分は ${esc(pick.name)}。${esc(pick.name)}を登用せずに ${PICKUP_AT}回で、${esc(pick.name)}の確定券が届きます。</p>` : ''}
      <p class="ty-note">天井（追加登用の回数）：${PITY.map((p) => `${p.at}回＝${p.label}`).join('・')}。120回で一巡し、数えは0へ戻ります。</p>
      ${tb(F, `無料の登用（毎日${FREE_DAILY}回・残りは翌日に持ち越しません）`)}
      <p class="ty-note">${SEAL_NOTE}</p><p class="ty-note">${GUARD_NOTE}</p></div>
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
    if (kind === 'ssRandom' || kind === 'aSelect') { const r = useTicket(st, kind, rng, null, banner); save(); return r ? shown(r.b) : bind(); }
    const list = ticketChoices(kind, banner);
    el.innerHTML = `<div class="ty-ov"><h2>登用する武将を選ぶ</h2><div class="ty-scroll"><div class="ty-packs">
      ${list.map((b) => `<button data-a="pick" data-id="${b.id}">${MARK[b.rank]} ${b.rank}<br><b>${esc(b.name)}</b><br><small>${HOUSE_NAME[b.house]}${st.owned[b.id] ? '・持っている' : ''}</small></button>`).join('')}</div></div>
      <div class="ty-foot"><button class="sec" data-a="back">選ばずに戻る</button></div></div>`;
    el.onclick = (e) => {
      const b = e.target.closest('[data-a]'); if (!b) return;
      if (b.dataset.a === 'pick') { const r = useTicket(st, kind, rng, b.dataset.id, banner); save(); if (r) return shown(r.b); }
      bind();
    };
  };
  const shown = (b) => done([b.id]);

  const bind = () => {
    kinView = null;
    home();
    el.onclick = (e) => {
      const b = e.target.closest('[data-a]'); if (!b || b.disabled) return;
      const a = b.dataset.a;
      if (a === 'close') { el.remove(); o.onClose && o.onClose(); return; }
      if (a === 'rates') return rates();
      if (a === 'koukan') return o.onKoukan(bind);  // 33 の交換所。閉じたら武将印の数を描き直す
      if (a === 'kin') return kin(0);
      if (a === 'tk') return ticket(b.dataset.k);
      const run = () => {
        const r = a === 'free' ? pull(st, 'free', 1, rng, banner) : a === 'one' ? pull(st, 'paid', 1, rng, banner) : a === 'ten' ? pull(st, 'paid', 10, rng, banner) : null;
        if (!r) return;
        if (!r.ok) return r.why === 'kin' ? lack(r.need) : bind();
        save(); draw(r.sets, r.got);
      };
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
