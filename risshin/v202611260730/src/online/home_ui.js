// オンラインのホーム・家を選ぶ・手持ちの一覧（k365-cloud-48。docs/online_plan_1121.md の受け持ち）。字は少なく絵で。
import { drawMon } from '../textures.js';
import { dailyStrip, openLegions, DAILY_CSS } from './daily_ui.js';
import { HOUSES, RARITY, ROSTER, COST_CAP, KATA, ROLES, bushoOf, costOf, armyCost, startersOf, loadOnline, saveOnline, newOnline, changeHouse, monCanvas, kataCanvas, drawKata, face, root, esc, lbl, lw, kinOf } from './house.js';

// ---- 家を選ぶ（初めて、または家を替える時）。onDone(o) に新しい手持ちを渡す。onBack は戻る ----
export function openHouseSelect(onDone, onBack, cur = null) {
  const el = root('家を選ぶ');
  let pick = null;
  el.insertAdjacentHTML('beforeend', `<div class="ol-top"><button type="button" class="ol-back" aria-label="戻る">‹</button><h2>家を選ぶ</h2></div>
    <div class="ol-houses" role="group" aria-label="六つの家">${HOUSES.map((h) => `<button type="button" class="ol-house" data-h="${h.id}" aria-pressed="false" aria-label="${esc(h.name)}・${startersOf(h.id).map(esc).join('・')}"><span class="ol-mon"></span><b>${esc(h.name)}</b><span class="ol-four" aria-hidden="true">${startersOf(h.id).map((n) => `<i style="background:${RARITY[bushoOf(n).rare].color}"></i>`).join('')}</span></button>`).join('')}</div>
    <div class="ol-foot"><div class="ol-pick" aria-live="polite"></div><button type="button" class="ol-go" disabled>この家で始める</button></div>`);
  el.querySelectorAll('.ol-house').forEach((b) => b.querySelector('.ol-mon').appendChild(monCanvas(HOUSES.find((h) => h.id === b.dataset.h).mon, 72, 72)));
  const go = el.querySelector('.ol-go'), pk = el.querySelector('.ol-pick');
  if (!cur) el.querySelectorAll('.ol-house').forEach((b) => b.classList.add('ol-hint'));   // 初めての人：家の札がゆっくり光る（どれかを押す所）
  el.querySelectorAll('.ol-house').forEach((b) => b.addEventListener('click', () => {
    pick = b.dataset.h; el.querySelectorAll('.ol-house').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    const h = HOUSES.find((x) => x.id === pick);
    go.disabled = false; go.textContent = `${h.name}で始める`;
    el.querySelectorAll('.ol-house').forEach((x) => x.classList.remove('ol-hint')); go.classList.add('ol-next');   // 選んだら次は始める釦が光る
    // 選んだ家の初めの4人の顔を並べる（字は名だけ）
    pk.innerHTML = '';
    for (const n of startersOf(pick)) { const f = document.createElement('div'); f.className = 'ol-face'; f.style.cssText = `--rc:${RARITY[bushoOf(n).rare].color};width:44px;height:44px;border-width:2px`; f.title = n; face(f, n); pk.appendChild(f); }
  }));
  go.addEventListener('click', () => { if (!pick) return; const o = cur ? changeHouse(cur, pick) : newOnline(pick); saveOnline(o); el.remove(); onDone && onDone(o); });
  el.querySelector('.ol-back').addEventListener('click', () => { el.remove(); onBack && onBack(); });
  el.querySelector('.ol-house').focus({ preventScroll: true });
  return el;
}


// ---- ホームの小さな絵（字の代わり） ----
function icon(kind, s, o) {
  const c = document.createElement('canvas'); c.width = s * 2; c.height = s * 2; c.style.width = `${s}px`; c.style.height = `${s}px`;
  const g = c.getContext('2d'), S = s * 2; g.strokeStyle = '#ece4d2'; g.fillStyle = '#ece4d2'; g.lineWidth = S * 0.06; g.lineCap = 'round';
  const L = (a, b, cc, d) => { g.beginPath(); g.moveTo(a * S, b * S); g.lineTo(cc * S, d * S); g.stroke(); };
  if (kind === 'match') { L(.15, .85, .85, .15); L(.85, .85, .15, .15); for (const [x, y, r] of [[.85, .15, -.785], [.15, .15, -2.356]]) { g.save(); g.translate(x * S, y * S); g.rotate(r); g.beginPath(); g.moveTo(S * .1, 0); g.lineTo(-S * .02, -S * .06); g.lineTo(-S * .02, S * .06); g.closePath(); g.fill(); g.restore(); } }
  else if (kind === 'toyo') { g.strokeRect(.22 * S, .18 * S, .56 * S, .64 * S); for (const y of [.34, .48, .62]) L(.32, y, .68, y); g.beginPath(); g.arc(.5 * S, .18 * S, .07 * S, 0, 6.3); g.fill(); }
  else if (kind === 'roster') { for (const [x, y] of [[.32, .32], [.68, .32], [.32, .68], [.68, .68]]) { g.beginPath(); g.arc(x * S, y * S, .14 * S, 0, 6.3); g.fill(); } }
  else if (kind === 'practice') { for (const r of [.38, .25, .12]) { g.beginPath(); g.arc(.5 * S, .5 * S, r * S, 0, 6.3); g.stroke(); } }
  else if (kind === 'tsutome') { g.strokeRect(.24 * S, .16 * S, .52 * S, .68 * S); for (const y of [.36, .52, .68]) { L(.32, y, .38, y + .05); L(.38, y + .05, .48, y - .05); L(.54, y, .68, y); } }
  else if (kind === 'house') { try { drawMon(g, HOUSES.find((h) => h.id === o?.house)?.mon || 'oda', S, S); } catch (e) { /* 紋の無い時は空 */ } }
  return c;
}
const HOME_CSS = `
.olh .olm{flex:1;min-height:0;display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);gap:12px;padding:8px 0}
.olh .olm-army{display:flex;flex-direction:column;gap:8px;border:1px solid #6a5a3a;border-radius:6px;background:#17130ecc;padding:10px;min-height:44px;align-items:stretch;text-align:left}
.olh .olm-faces{display:flex;gap:10px;align-items:center;justify-content:center;flex:1}
.olh .olm-faces .ol-face{width:56px;height:56px}
.olh .olm-faces .ol-face.big{width:80px;height:80px}
.olh .olm-tiles{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));grid-auto-rows:1fr;gap:10px}
.olh .olm-tile{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;border:1px solid #6a5a3a;border-radius:6px;background:#17130ecc;min-height:44px;padding:6px}
.olh .olm-tile.main{grid-column:1 / -1;background:linear-gradient(180deg,#a8402a,#6e2016);border-color:#e0a070}
.olh .olm-tile:disabled{opacity:.35}
.olh .olm-tile{position:relative}
.olh .olm-dot{position:absolute;top:8px;right:8px;width:14px;height:14px;border-radius:50%;background:#d23a26;box-shadow:0 0 0 2px #f4d98a}
.olh .olm-tile span{font-size:max(15px,calc(15px * var(--text-scale,1)));letter-spacing:.12em}
.olh .olm-kin{display:flex;align-items:center;gap:6px;min-height:44px;padding:0 0 0 10px;border:1px solid #6a5a3a;border-radius:4px;background:#14120fcc}
.olh .olm-zeni{display:flex;align-items:center;gap:6px;min-height:44px;padding:0 10px;border:1px solid #6a5a3a;border-radius:4px;background:#14120fcc}
.olh .olm-zeni b{font-size:16px;font-variant-numeric:tabular-nums;min-width:2ch;text-align:right}
.olh .olm-zcoin{width:18px;height:18px;border-radius:50%;background:radial-gradient(circle at 35% 35%,#e0a070,#9a5a2a);box-shadow:inset 0 0 0 2px #6a3a1a;display:inline-flex;align-items:center;justify-content:center}
.olh .olm-zcoin::after{content:'';width:6px;height:6px;background:#14120f}
.olh .olm-coin{width:18px;height:18px;border-radius:50%;background:radial-gradient(circle at 35% 35%,#f4d98a,#b8913a);box-shadow:inset 0 0 0 2px #8a6a2a}
.olh .olm-kin b{font-size:16px;font-variant-numeric:tabular-nums;min-width:2ch;text-align:right}
.olh .olm-kin.up b{animation:olKin .6s}
@keyframes olKin{30%{color:#f4d98a;transform:scale(1.25)}}
@media (prefers-reduced-motion:reduce){.olh .olm-kin.up b{animation:none}}
.olh .olm-kinadd{min-width:44px;min-height:44px;border:0;border-left:1px solid #6a5a3a;background:none;font-size:20px;color:#d9b45a}
.olh .olm-kinadd:disabled{opacity:.35}
.olh .olm-house{display:flex;align-items:center;gap:8px;min-height:44px;padding:0 10px;border:1px solid #6a5a3a;border-radius:4px;background:#14120fcc}
.olh .olr{flex:1;min-height:0;overflow-y:auto;display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:8px;padding:8px 0;align-content:start}
.olh .olr .ol-card{width:auto}
@media (max-width:720px){.olh .olm{grid-template-columns:1fr}}
@media (min-height:700px) and (min-width:1000px){.olh .olr{grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:14px}.olh .olr .ol-card{padding:12px 6px;gap:6px}.olh .olr .ol-card .ol-face{width:88px;height:88px}.olh .olr .ol-card .ol-name{font-size:16px}}
@media (min-height:700px) and (min-width:1000px){.olh .olm{max-height:520px;margin-block:auto}.olh .olm-faces .ol-face{width:90px;height:90px}.olh .olm-faces .ol-face.big{width:120px;height:120px}}
`;

// ---- オンラインのホーム（紙の 119：合戦・軍団編成・武将登用・武将一覧・家・模擬合戦） ----
// hooks：{ match, hensei, toyo, practice, back }（online/index.js がつなぐ）。無い口の札は薄く押せない。手持ちが無ければ先に家を選ぶ
export function openOnlineHome(hooks = {}) {
  const o = loadOnline();
  if (!o) return openHouseSelect(() => openOnlineHome(hooks), hooks.back);
  const el = root('オンラインのホーム');
  el.querySelector('style').insertAdjacentText('beforeend', HOME_CSS + DAILY_CSS);
  const h = HOUSES.find((x) => x.id === o.house) || HOUSES[0];
  const CAPS = { 4: 65, 5: 80, 6: 95, 7: 110, 8: 125, 9: 140, 10: 155, 11: 170, 12: 185, 13: 200, 14: 215, 15: 230, 16: 245 };
  const cost = armyCost((o.army || []).slice(1)), CAP = CAPS[Math.max(4, Math.min(16, o.slots || 4))] || COST_CAP;   // 編成の画面（hensei_ui.vassalCost・capOf）と同じ：総大将は数えず、上限は開けた枠で上がる
  el.insertAdjacentHTML('beforeend', `<div class="ol-top"><button type="button" class="ol-back" aria-label="戻る">‹</button><h2>腕比べ</h2>
    <span class="olm-zeni" style="margin-left:auto" aria-label="銭 ${(o.matchBook?.zeni || 0).toLocaleString()}"><span class="olm-zcoin" aria-hidden="true"></span><b>${(o.matchBook?.zeni || 0).toLocaleString()}</b></span>
    <span class="olm-kin"><span class="olm-coin" aria-hidden="true"></span><b aria-live="polite">${kinOf(o).toLocaleString()}</b><button type="button" class="olm-kinadd" data-kin aria-label="金を足す">＋</button></span>
    <button type="button" class="olm-house" data-k="house" aria-label="家：${esc(h.name)}"></button></div>
    <div class="olm"><button type="button" class="olm-army" data-k="hensei" aria-label="軍団の編成・${(o.army || []).map(esc).join('・')}・重さ${cost}/${CAP}">
      <div class="olm-faces"></div><div class="ol-meter" aria-hidden="true" style="margin:0 auto"><div class="ol-cells">${'<i></i>'.repeat(COST_CAP)}</div><b>${cost}/${CAP}</b></div></button>
      <div class="olm-tiles">
        <button type="button" class="olm-tile main" data-k="match"><span>合戦</span></button>
        <button type="button" class="olm-tile" data-k="toyo"><span>登用</span></button>
        <button type="button" class="olm-tile" data-k="roster"><span>武将</span></button>
        <button type="button" class="olm-tile" data-k="practice"><span>模擬合戦</span></button>
        <button type="button" class="olm-tile" data-k="tsutome" aria-label="毎日の務め"><i class="olm-dot" hidden></i><span>務め</span></button>
      </div></div>`);
  // 毎日の理由（daily_war.js）：今日の敵軍・今週の題・歴史軍団を一目で。押すと戦いの支度（敵・戦場・難易度が決まって開く）
  if (hooks.daily) { const ds = dailyStrip(o, (f) => { el.remove(); hooks.daily(f); }, () => { el.remove(); openLegions(loadOnline(), (f) => hooks.daily(f), again); }); el.querySelector('.olm').appendChild(ds); }
  const hb = el.querySelector('.olm-house'); hb.appendChild(icon('house', 28, o)); hb.insertAdjacentHTML('beforeend', `<span>${esc(h.name)}</span>`);
  el.querySelectorAll('.ol-cells i').forEach((c, i) => { c.className = cost > CAP ? 'over' : i < Math.round(cost * COST_CAP / CAP) ? 'on' : ''; });   // 上限を超えた軍は升を全部赤に（押せば編成で直す）
  const fs = el.querySelector('.olm-faces');
  (o.army || []).forEach((n, i) => { const b = bushoOf(n); if (!b) return; const f = document.createElement('div'); f.className = 'ol-face' + (i === 0 ? ' big' : ''); f.style.setProperty('--rc', RARITY[b.rare].color); face(f, n); fs.appendChild(f); });
  for (const t of el.querySelectorAll('.olm-tile')) t.prepend(icon(t.dataset.k, t.classList.contains('main') ? 40 : 30, o));
  const again = () => openOnlineHome(hooks);
  const go = {
    hensei: hooks.hensei, match: hooks.match, toyo: hooks.toyo, practice: hooks.practice, tsutome: hooks.tsutome,
    roster: () => openRoster(loadOnline(), again),
    house: () => openHouseSelect(again, again, loadOnline()),
  };
  // 初めての人の道しるべ：登用 → 編成 → 模擬合戦 → 合戦 の順に、まだ押していない一つだけを光らせる（押したら箱の guide に残す）
  const guide = o.guide || {};
  const nextK = ['toyo', 'hensei', 'practice', 'match'].find((k) => !guide[k] && go[k]);
  if (nextK) el.querySelector(`[data-k="${nextK}"]`)?.classList.add('ol-next');
  el.querySelectorAll('[data-k]').forEach((b) => {
    const f = go[b.dataset.k];
    if (!f) { b.disabled = true; return; }
    b.addEventListener('click', () => { const x = loadOnline(); if (x && !x.guide?.[b.dataset.k]) { x.guide = { ...(x.guide || {}), [b.dataset.k]: 1 }; saveOnline(x); } el.remove(); f(again); });
  });
  el.querySelector('.ol-back').addEventListener('click', () => { el.remove(); hooks.back && hooks.back(); });
  // 金：右上の金の字と『＋』（金を足す）。買うのは 33 の流れ（hooks.kin(done)：ホームの上に買い場を開き、閉じたら done）。
  //   買った後は saveOnline の知らせで、ホームを開いたまま金の字がその場で替わる
  const kb = el.querySelector('[data-kin]'), kv = el.querySelector('.olm-kin b');
  if (!hooks.kin) kb.disabled = true;
  else kb.addEventListener('click', () => { el.hidden = true; hooks.kin(() => { if (!el.isConnected) return; el.hidden = false; kv.textContent = kinOf(loadOnline()).toLocaleString(); kb.focus({ preventScroll: true }); }); });
  // 毎日の務め（33）：受け取れる務めがある時だけ札の右上に赤い丸（形でも分かるよう金の縁）。保存のたびに見直す
  const dot = el.querySelector('.olm-dot'), tsb = el.querySelector('[data-k="tsutome"]');
  const tsuCheck = (save) => import('./tsutome.js').then((Ts) => {
    if (!el.isConnected || !save) return;
    const ready = Ts.today(JSON.parse(JSON.stringify(save))).some((x) => x.done && !x.got);
    dot.hidden = !ready; tsb.setAttribute('aria-label', ready ? lbl('毎日の務め', '受け取れる') : lbl('毎日の務め'));
  }).catch(() => {});
  tsuCheck(o);
  const zv = el.querySelector('.olm-zeni');   // 銭（40 の試合の褒美・matchBook.zeni）：33 が出す
  const onSaved = (e) => { if (!el.isConnected) { window.removeEventListener('risshin-online-saved', onSaved); return; } tsuCheck(e.detail); if (zv) { const z = (e.detail?.matchBook?.zeni || 0).toLocaleString(); zv.querySelector('b').textContent = z; zv.setAttribute('aria-label', '銭 ' + z); } kv.textContent = kinOf(e.detail).toLocaleString(); kv.parentElement.classList.remove('up'); void kv.offsetWidth; kv.parentElement.classList.add('up'); };
  window.addEventListener('risshin-online-saved', onSaved);
  el.querySelector('.olm-tile.main').focus({ preventScroll: true });
  return el;
}

// ---- 手持ちの一覧：顔・名・レア・得意の兵種の絵。レアの高い順 ----
export function openRoster(o, onBack) {
  o = o || loadOnline(); if (!o) { onBack && onBack(); return null; }
  const el = root('手持ちの武将');
  el.querySelector('style').insertAdjacentText('beforeend', HOME_CSS);
  const order = ['SSR', 'SR', 'R', 'N'];
  const list = o.owned.map(bushoOf).filter(Boolean).sort((a, b) => order.indexOf(a.rare) - order.indexOf(b.rare));
  el.insertAdjacentHTML('beforeend', `<div class="ol-top"><button type="button" class="ol-back" aria-label="戻る">‹</button><h2>武将</h2><b style="margin-left:auto;font-size:16px">${list.length}</b></div><div class="olr" role="list"></div>`);
  const box = el.querySelector('.olr');
  for (const b of list) {
    const c = document.createElement('div'); c.className = 'ol-card' + (o.army?.includes(b.name) ? '' : ''); c.setAttribute('role', 'listitem');
    c.setAttribute('aria-label', lbl(b.name, b.rare, KATA.find((k) => k.id === b.fav)?.name || '', o.army?.includes(b.name) ? lw('軍団') : ''));
    c.innerHTML = `<div class="ol-face" style="--rc:${RARITY[b.rare].color}"></div><span class="ol-name">${esc(b.name)}</span><span style="display:flex;gap:4px;align-items:center"><span class="ol-rare" style="--rc:${RARITY[b.rare].color}">${b.rare}</span></span>`;
    face(c.querySelector('.ol-face'), b.name);
    c.lastElementChild.appendChild(kataCanvas(b.fav, 18));
    if (o.army?.includes(b.name)) c.style.borderColor = '#d9b45a';   // 軍団に入っている者は金の縁
    box.appendChild(c);
  }
  el.querySelector('.ol-back').addEventListener('click', () => { el.remove(); onBack && onBack(); });
  return el;
}
