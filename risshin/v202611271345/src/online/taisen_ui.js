// ［対戦］の入口と諸大名（NPC）の選び（K603 1〜10・58〜67・11/21 iMac k592）
//   ホーム →［対戦］→［オンライン対戦 他のプレイヤーと戦う］［諸大名と戦う NPC軍団と戦う］［模擬合戦 自分の軍団を試す］
//   諸大名：家と特徴 → 代表の4人（同じ家でも編成を幾つか・時代）→ 難易度（初級〜修羅）→ 戦場 →（布陣は index.js の toFujin）
//   模擬合戦：同じ選びで相手を自分で決める（褒美なし・段位は動かない）
//   家×時代の編成の表は online/npc_clans.js（codex が作る）があればそれを先に使い、無ければ登用の表（bushou_online.js）の初めの4人と、同じ家の上位の4人。
//   使い方：openTaisen({ onOnline(), onNpc({ house, level, foe, map, practice }), onBack() })
import { BUSHOU_ONLINE } from './bushou_online.js';
import { NPC_LEVEL, CLAN_STYLE, FOE_RATIO } from './general_ai.js';
import { isEn, tr, addEn } from '../i18n.js';
import { troopsOf } from './unit_type.js';   // K638：兵力の棒も格で率いる兵（軍団の画面の総兵力と同じ数）
if (isEn()) import('./i18n_toyo.js').then((m) => addEn(m.default)).catch(() => {});   // K516：布陣・諸大名戦の画面でも登用の訳を使う

const HOUSE = [
  { id: 'oda', name: '織田家', mon: 'oda', en: 'Oda' }, { id: 'takeda', name: '武田家', mon: 'takeda', en: 'Takeda' }, { id: 'uesugi', name: '上杉家', mon: 'uesugi', en: 'Uesugi' },
  { id: 'tokugawa', name: '徳川家', mon: 'tokugawa', en: 'Tokugawa' }, { id: 'mori', name: '毛利家', mon: 'mori', en: 'Mori' }, { id: 'shimazu', name: '島津家', mon: 'shimazu', en: 'Shimazu' },
  { id: 'date', name: '伊達家', mon: 'date', en: 'Date' }, { id: 'hojo', name: '北条家', mon: 'hojo', en: 'Hojo' }, { id: 'toyotomi', name: '豊臣家', mon: 'toyotomi', en: 'Toyotomi' },
];
// 家の特徴の短い言葉（K603 58）
const TRAIT = { oda: ['鉄砲', '攻勢'], takeda: ['騎馬', '高士気'], uesugi: ['波状攻撃', '機動'], tokugawa: ['防御', '予備'], mori: ['伏兵', '射撃'], shimazu: ['反転', '追撃'], date: ['騎馬', '鉄砲'], hojo: ['守り', '持久'], toyotomi: ['大軍', '包囲'] };
const TRAIT_EN = { 鉄砲: 'Guns', 攻勢: 'Offense', 騎馬: 'Cavalry', 高士気: 'High morale', 波状攻撃: 'Waves', 機動: 'Mobile', 防御: 'Defense', 予備: 'Reserves', 伏兵: 'Ambush', 射撃: 'Missiles', 反転: 'Feint', 追撃: 'Pursuit', 守り: 'Defense', 持久: 'Endurance', 大軍: 'Mass', 包囲: 'Encircle' };
const RANK = ['SSR', 'SR', 'R', 'N'];
// K628 ④：筋書きの地の戦場（match.js STORY_FIELDS と同じ）。選ぶ時に守る側か攻める側かを選ぶ（どの家でもどちらの側でも）
const SIDES = { shitara: { def: ['守る（馬防柵の内・織田と徳川の側）', 'Defend (behind the fences)'], atk: ['攻める（連吾川を渡る・武田の側）', 'Attack (cross the river)'] },
  tennoji: { def: ['守る（茶臼山・豊臣の側）', 'Defend (Chausuyama)'], atk: ['攻める（南から・徳川の側）', 'Attack (from the south)'] },
  sekigahara: { def: ['守る（笹尾山の柵・西軍）', 'Defend (Sasaoyama fences)'], atk: ['攻める（陣場野から・東軍）', 'Attack (from Jinbano)'] },
  kawanaka: { def: ['守る（八幡原の鶴翼・武田の側）', 'Defend (Hachimanbara)'], atk: ['攻める（霧の北から・上杉の側）', 'Attack (out of the fog)'] } };
const MAPS = [{ id: 'heigen', name: '平原', en: 'Plain' }, { id: 'kawa', name: '川と橋', en: 'River' }, { id: 'sekigahara', name: '関ヶ原', en: 'Sekigahara' }, { id: 'tennoji', name: '天王寺・岡山', en: 'Tennoji-Okayama' }, { id: 'shitara', name: '設楽原', en: 'Shitara' }, { id: 'kawanaka', name: '川中島', en: 'Kawanakajima' }];
const LEVELS = ['shokyu', 'chukyu', 'jokyu', 'shura'];
const LV_EN = { shokyu: 'Easy', chukyu: 'Normal', jokyu: 'Hard', shura: 'Shura' };

// K608：難易度の一言（どの位の強さか）
const LV_DESC = { shokyu: '初級：動きが遅く、予備と側面が甘い。軍団の Cost も少し低い。はじめての人に', chukyu: '中級：ふつうの戦い方。同じ兵力・同じ Cost', jokyu: '上級：伏兵・側面・予備・地形をよく使う。敵が一隊多い', shura: '修羅：布陣と兵種の相性を読み、判断が早い。敵が二隊多い' };
const LV_DESC_EN = { shokyu: 'Easy: slow to react, weak reserves.', chukyu: 'Normal: standard tactics, same strength.', jokyu: 'Hard: ambush, flanks and terrain. One more enemy unit.', shura: 'Shura: reads matchups, fast decisions. Two more enemy units.' };
/** 家臣団（十人ほど）：npc_clans.js の NPC_RETAINERS か、登用の表のその家の者（位の順） */
export function retainersOf(house, NC) {
  const R = NC?.NPC_RETAINERS?.[house]; if (Array.isArray(R) && R.length) return R.slice(0, 16);
  return BUSHOU_ONLINE.filter((b) => b.house === house).sort((a, b) => RANK.indexOf(a.rank) - RANK.indexOf(b.rank)).map((b) => b.name).slice(0, 16);
}
/** 家の編成の候補：[{ id, name, era, generals:[4] }]。npc_clans.js の形（NPC_CLANS[house] = [{ id, name, era, generals }]）を先に */
export function clanVariants(house, NC) {
  // codex の npc_clans.js：NPC_CLANS＝[{ id:'oda', formations:[{ id, name, nameEn, year, generals:[登用の表の id] }] }]（NPC_CLAN_BY_ID もある）。
  //   名で書いた形（NPC_CLANS[house]＝[{ generals:[名] }]）も読む
  // K608：登用の表の id か、名（登用の表に居ない家臣も名で書ける＝伊達・北条・豊臣）
  const byId = (x) => BUSHOU_ONLINE.find((b) => b.id === x)?.name || (BUSHOU_ONLINE.some((b) => b.name === x) || /[^\x00-\x7f]/.test(String(x)) ? x : null);
  const clan = NC?.NPC_CLAN_BY_ID?.[house] || (Array.isArray(NC?.NPC_CLANS) ? NC.NPC_CLANS.find((c) => c.id === house) : null);
  const ext = clan?.formations || (!Array.isArray(NC?.NPC_CLANS) ? NC?.NPC_CLANS?.[house] : null);
  if (Array.isArray(ext) && ext.length) {
    const vs = ext.map((v, i) => ({ id: v.id || `${house}${i}`, name: (isEn() ? v.nameEn : v.name) || v.name || '', era: v.year ? String(v.year) : v.era || '', generals: (v.generals || []).map(byId).filter(Boolean).slice(0, 16) })).filter((v) => v.generals.length >= 4);
    if (vs.length) return vs;
  }
  const all = BUSHOU_ONLINE.filter((b) => b.house === house);
  const st = all.filter((b) => b.start).sort((a, b) => RANK.indexOf(a.rank) - RANK.indexOf(b.rank)).map((b) => b.name);
  const out = [];
  if (st.length >= 4) out.push({ id: `${house}A`, name: 'A', era: '', generals: st.slice(0, 4) });
  // B：総大将はそのまま、家臣は家の中の上位の者（初めの4人と重ならない者を先に）
  const lord = st[0] || all.sort((a, b) => RANK.indexOf(a.rank) - RANK.indexOf(b.rank))[0]?.name;
  const others = all.filter((b) => b.name !== lord && !st.includes(b.name)).sort((a, b) => RANK.indexOf(a.rank) - RANK.indexOf(b.rank)).map((b) => b.name);
  if (lord && others.length >= 3) out.push({ id: `${house}B`, name: 'B', era: '', generals: [lord, ...others.slice(0, 3)] });
  return out;
}

const CSS = `.tz{position:fixed;inset:0;z-index:62;background:radial-gradient(ellipse at 50% 30%,#2a2117,#120e09);color:#f1e7d0;font:15px/1.45 "Hiragino Mincho ProN",serif;display:flex;flex-direction:column;padding:env(safe-area-inset-top,0px) calc(12px + env(safe-area-inset-right,0px)) env(safe-area-inset-bottom,0px) calc(12px + env(safe-area-inset-left,0px));box-sizing:border-box;overflow:hidden}
.tz-top{display:flex;align-items:center;gap:10px;min-height:52px}
.tz-top h2{margin:0;font-size:20px;letter-spacing:.2em}
.tz-b{min-height:44px;min-width:44px;padding:0 14px;border-radius:6px;border:1px solid #c9a46a;background:rgba(30,22,14,.7);color:#f1e7d0;font:inherit;font-size:15px}
.tz-b[aria-pressed=true]{background:#8a2a1f;border-color:#ffe2a0}
.tz-b:disabled{opacity:.4}
.tz-three{flex:1;display:flex;gap:12px;align-items:stretch;justify-content:center;padding:8px 0 14px}
.tz-big{flex:1;max-width:260px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;border:1px solid #c9a46a;border-radius:8px;background:linear-gradient(180deg,rgba(60,42,24,.85),rgba(24,17,10,.9));color:#f1e7d0;font:inherit;padding:10px}
.tz-big b{font-size:20px;letter-spacing:.15em}.tz-big span{font-size:13px;opacity:.85}
.tz-big.main{border-color:#ffd88a;box-shadow:0 0 0 1px #ffd88a55}
.tz-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(128px,1fr));gap:8px;overflow:auto;padding:4px 0 10px}
.tz-h{display:flex;align-items:center;gap:8px;min-height:56px;padding:6px 8px;border:1px solid #8a6a40;border-radius:6px;background:rgba(30,22,14,.75);color:#f1e7d0;font:inherit;text-align:left}
.tz-h[aria-pressed=true]{border-color:#ffe2a0;background:rgba(110,36,24,.7)}
.tz-h small{display:block;font-size:12px;opacity:.85}
.tz-pane{flex:1;display:flex;gap:12px;min-height:0}
.tz-col{display:flex;flex-direction:column;gap:8px;min-width:0}
.tz-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.tz-four{display:flex;gap:6px}
.tz-g{width:62px;display:flex;flex-direction:column;align-items:center;font-size:11px;line-height:13px;text-align:center}
.tz-g .f{width:44px;height:44px;border-radius:50%;overflow:hidden;background:#3a3226;border:2px solid var(--rc,#8a8478)}
.tz-g .f img{width:100%;height:100%;object-fit:cover}
.tz-note{font-size:12px;opacity:.8}
.tz-scr>*{flex:none}   /* K624 ⑬：流す欄の中の者を縮ませない（縮んで上の4人と家臣団が重なっていた） */
.tz-ft{flex:none;display:flex;flex-direction:column;gap:5px;padding:6px 0 8px;border-top:1px solid #8a6a4066}
.tz-mp{min-height:44px;padding:2px 4px;display:flex;flex-direction:column;align-items:center;gap:1px;font-size:11px;line-height:12px}
.tz-mp canvas{display:block;border-radius:2px}
.tz-bar{display:flex;align-items:center;gap:6px;font-size:12.5px}.tz-bar i{display:block;height:8px;border-radius:4px}
.tz-go{margin-left:auto;background:linear-gradient(180deg,#a8402a,#6e2016);border-color:#e0a070;font-size:16px;letter-spacing:.1em}`;

const RC = { SSR: '#e0b84a', SR: '#c9563a', R: '#4a72a8', N: '#8a8478' };
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// K616（原理8）：戦場の小さな絵図（56×26）。丘＝土色の丸・川＝藍の線・橋＝茶・林＝緑の点・道＝点線。上が敵・下が自陣（布陣の地図と同じ向き）
function mapThumb(T) {
  if (!T) return null;
  const Wt = 56, Ht = 26, c = document.createElement('canvas'), dpr = Math.min(2, globalThis.devicePixelRatio || 1);
  c.width = Wt * dpr; c.height = Ht * dpr; c.style.width = Wt + 'px'; c.style.height = Ht + 'px'; c.setAttribute('aria-hidden', 'true');
  const g = c.getContext('2d'); if (!g) return c; g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const k = Wt / 420, X = (x) => Wt / 2 - x * k, Y = (z) => Ht / 2 - z * k * 0.68;
  g.fillStyle = '#e4d6b4'; g.fillRect(0, 0, Wt, Ht);
  g.fillStyle = 'rgba(160,40,30,.16)'; g.fillRect(0, 0, Wt, Ht * 0.3); g.fillStyle = 'rgba(40,70,120,.16)'; g.fillRect(0, Ht * 0.7, Wt, Ht * 0.3);
  g.strokeStyle = 'rgba(140,96,50,.75)'; g.lineWidth = 1; g.setLineDash([2, 2]);
  for (const pts of T.roads || []) { g.beginPath(); pts.forEach(([x, z], i) => (i ? g.lineTo(X(x), Y(z)) : g.moveTo(X(x), Y(z)))); g.stroke(); }
  g.setLineDash([]);
  for (const q of T.hills || []) { g.fillStyle = '#b89462'; g.beginPath(); g.ellipse(X(q.x), Y(q.z), Math.max(2, q.r * k), Math.max(1.5, q.r * k * 0.68), 0, 0, 6.3); g.fill(); }
  for (const f of T.forests || []) { g.fillStyle = '#3f6a3a'; g.beginPath(); g.ellipse(X(f.x), Y(f.z), Math.max(2, f.r * k * (f.sx || 1)), Math.max(1.5, f.r * k * 0.68 * (f.sz || 1)), 0, 0, 6.3); g.fill(); }
  for (const R of T.rivers || []) {
    g.strokeStyle = '#3e6288'; g.lineWidth = 2; g.beginPath(); R.pts.forEach(([x, z], i) => (i ? g.lineTo(X(x), Y(z)) : g.moveTo(X(x), Y(z)))); g.stroke();
    for (const f of R.fords || []) { g.fillStyle = f.bridge ? '#6a4626' : '#e8dcb8'; g.fillRect(X(f.x) - 2, Y(f.z) - 2, 4, 4); }
  }
  for (const v of T.villages || []) { g.fillStyle = '#4a3a2a'; g.fillRect(X(v.x) - 1.5, Y(v.z) - 1.5, 3, 3); }
  return c;
}

export function openTaisen(hooks = {}) {
  const en = isEn(), W = (j, e) => (en ? e : j);
  const el = document.createElement('div'); el.className = 'tz'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', W('対戦', 'Battle'));
  const st = document.createElement('style'); st.textContent = CSS; el.appendChild(st);
  const body = document.createElement('div'); body.style.cssText = 'flex:1;display:flex;flex-direction:column;min-height:0'; el.appendChild(body);
  document.body.appendChild(el);
  let H = null, NC = null;
  let RW = null, MI = null, TI = null, TT = null, TK = null;
  const ready = Promise.all([import('./house.js').then((m) => (H = m)).catch(() => null), import('./npc_clans.js').then((m) => (NC = m)).catch(() => null),
    import('./npc_reward.js').then((m) => (RW = m)).catch(() => null), import('./michi.js').then((m) => (MI = m)).catch(() => null), import('./npc_titles_ui.js').then((m) => (TI = m)).catch(() => null), import('./match_terrain.js').then((m) => (TT = m)).catch(() => null), import('./teki_ui.js').then((m) => (TK = m)).catch(() => null)]);
  const save = () => H?.loadOnline?.() || null;
  const close = () => el.remove();
  const top = (title, back) => {
    const t = document.createElement('div'); t.className = 'tz-top';
    const b = document.createElement('button'); b.type = 'button'; b.className = 'tz-b'; b.textContent = '‹'; b.setAttribute('aria-label', W('戻る', 'Back')); b.onclick = back;
    const h = document.createElement('h2'); h.textContent = title; t.append(b, h); return t;
  };

  // ① 入口：三つ
  function entrance() {
    body.innerHTML = '';
    body.appendChild(top(W('対戦', 'Battle'), () => { close(); hooks.onBack?.(); }));
    if (hooks.onToyo) { const yb = document.createElement('button'); yb.type = 'button'; yb.className = 'tz-b'; yb.dataset.k = 'toyo'; yb.style.marginLeft = 'auto'; yb.textContent = W('武将登用', 'Recruit'); yb.onclick = () => { close(); hooks.onToyo(); }; body.firstChild.appendChild(yb); }   // K608 ③：対戦 → 武将登用
    if (hooks.onGundan) { const gb = document.createElement('button'); gb.type = 'button'; gb.className = 'tz-b'; gb.dataset.k = 'gundan'; gb.style.marginLeft = hooks.onToyo ? '0' : 'auto'; gb.textContent = W('軍団編成', 'Army'); gb.onclick = () => { close(); hooks.onGundan(); }; body.firstChild.appendChild(gb); }   // 長 11/21（kaito）：対戦の入口からも軍団の組み替えへ
    const box = document.createElement('div'); box.className = 'tz-three';
    const big = (k, t, s, main) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'tz-big' + (main ? ' main' : ''); b.dataset.k = k; b.innerHTML = `<b>${esc(t)}</b><span>${esc(s)}</span>`; box.appendChild(b); return b; };
    // K612（11/21 長）：本番の受け渡し所（net_match.js の serverUrl）が無い間は、対人戦を「準備中」にして押せなくする（諸大名と戦うで遊べる）
    if (hooks.pvpReady === false) { const pb = big('online', W('オンライン対戦', 'Online battle'), W('準備中', 'Coming soon'), false); pb.disabled = true; pb.setAttribute('aria-disabled', 'true'); pb.style.opacity = '.5'; }
    else big('online', W('オンライン対戦', 'Online battle'), W('他のプレイヤーと戦う', 'Fight other players'), true).onclick = () => { close(); hooks.onOnline?.(); };
    big('npc', W('諸大名と戦う', 'Fight the warlords'), W('NPC軍団と戦う', 'Fight an NPC army')).onclick = () => pickHouse(false);
    // K608 ④（長 11/21・kaito「諸大名と戦うと模擬合戦の違いが分からない」）：諸大名と戦うに一本化。武将の試しは武将の詳細の［試す］から
    body.appendChild(box);
    // 初心者の道（k598-home の michi.js）：模擬合戦→織田 初級→武田 中級→対人。全部済めば出さない
    ready.then(() => { const st0 = MI?.michiStrip?.(save()); if (st0 && box.isConnected) { st0.style.cssText += ';justify-content:center;padding-bottom:10px'; body.appendChild(st0); } });
  }

  // K611 ③［敵を決める］：どの家の武将でも敵に・一隊の兵力と兵種も自由（teki_ui.js）。褒美なし
  async function openTekiHere() {
    await ready; if (!TK?.openTeki) return;
    const mineArmy = ((H?.loadOnline?.() || {}).army || []).filter(Boolean).slice(0, 16), mineCount = mineArmy.length || 4;   // K638：自軍の兵力を格の兵で出すため名も渡す
    TK.openTeki(body, { top, houses: HOUSE, maps: MAPS, face: H?.face, mineCount, mineArmy, onBack: () => pickHouse(false), onGo: (cfg) => { close(); hooks.onFree(cfg); } });
  }
  // ② 家と特徴 → 代表の4人・難易度・戦場（一つの画面で選ぶ）
  async function pickHouse(practice, sel = null, pre = null) {
    await ready;
    body.innerHTML = '';
    const tp = top(practice ? W('模擬合戦', 'Practice battle') : W('諸大名と戦う', 'Fight the warlords'), entrance);
    if (hooks.onFree && !practice) { const fb = document.createElement('button'); fb.type = 'button'; fb.className = 'tz-b'; fb.dataset.k = 'teki'; fb.style.marginLeft = 'auto'; fb.textContent = W('敵を決める', 'Build the enemy'); fb.onclick = () => openTekiHere(); tp.appendChild(fb); }   // K611 ③：自由な戦（teki_ui.js）
        if (TI?.openTitles && !practice) { const tb = document.createElement('button'); tb.type = 'button'; tb.className = 'tz-b'; tb.style.marginLeft = hooks.onFree ? '0' : 'auto'; tb.textContent = W('称号', 'Titles'); tb.onclick = () => TI.openTitles(() => {}); tp.appendChild(tb); }
    body.appendChild(tp);
    const pane = document.createElement('div'); pane.className = 'tz-pane'; body.appendChild(pane);
    const grid = document.createElement('div'); grid.className = 'tz-grid'; grid.style.cssText = 'flex:0 0 44%';
    const right = document.createElement('div'); right.className = 'tz-col'; right.style.flex = '1'; right.style.minHeight = '0';   // K608：家臣団と一言が増えたので縦に流せるように
    pane.append(grid, right);
    const state = { house: sel, variant: 0, level: 'chukyu', map: 'heigen', side: 'def' };
    // 毎日の理由（daily_war.js）：今日の敵軍・今週の題・歴史軍団から来た時は、敵・戦場・難易度を決めて開く。そのまま［布陣へ］なら報いの印が付く（途中で替えたら付かない）
    if (pre?.house) { state.house = pre.house; const vi = clanVariants(pre.house, NC).findIndex((x) => x.id === pre.variant); state.variant = vi > 0 ? vi : 0; state.level = pre.level || 'chukyu'; state.map = pre.map || 'heigen'; state.side = pre.side || 'def'; }
    const avail = (h) => clanVariants(h, NC).length > 0;
    for (const h of HOUSE) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'tz-h'; b.dataset.house = h.id;
      const ok = avail(h.id);
      b.disabled = !ok;
      const tr2 = (TRAIT[h.id] || []).map((x) => (en ? TRAIT_EN[x] : x)).join('・');
      b.innerHTML = `<span class="m" style="flex:none"></span><span><b>${esc(en ? h.en : h.name)}</b><small>${esc(ok ? tr2 : W('支度中', 'Coming soon'))}</small></span>`;
      if (H?.monCanvas) b.querySelector('.m').appendChild(H.monCanvas(h.mon, 34, 34));
      // 家ごとの印（k598-tonya の npc_reward.js）：初勝利済み＝金の丸・挑戦済み＝朱の丸
      const hh = !practice && RW?.houseHonors ? RW.houseHonors(save() || {}, h.id) : null;
      if (hh && (hh.first || hh.chal)) { const mk = document.createElement('span'); mk.style.cssText = 'margin-left:auto;display:flex;gap:3px;flex:none'; mk.setAttribute('aria-label', [hh.first ? W('初勝利済み', 'First win') : '', hh.chal ? W('挑戦済み', 'Challenge done') + ' ' + hh.chalName : ''].filter(Boolean).join('・'));
        mk.innerHTML = `${hh.first ? '<i style="width:10px;height:10px;border-radius:50%;background:#e6c77a;display:block"></i>' : ''}${hh.chal ? '<i style="width:10px;height:10px;border-radius:50%;background:#c9563a;display:block"></i>' : ''}`; b.appendChild(mk); }
      b.onclick = () => { state.house = h.id; state.variant = 0; drawRight(); };
      grid.appendChild(b);
    }
    function drawRight() {
      for (const b of grid.querySelectorAll('.tz-h')) b.setAttribute('aria-pressed', String(b.dataset.house === state.house));
      right.innerHTML = '';
      // K616（ui_refs_sengoku 原理1・8）：上（家の顔ぶれ）は縦に流し、下の難易度・戦場・［布陣へ］は流さずいつも見える所に
      const scr = document.createElement('div'); scr.className = 'tz-scr'; scr.style.cssText = 'flex:1;min-height:0;overflow-y:auto;display:flex;flex-direction:column;gap:8px';
      const ft = document.createElement('div'); ft.className = 'tz-ft';
      if (!state.house) { const p = document.createElement('p'); p.className = 'tz-note'; p.textContent = W('相手の家を選ぶ', 'Choose the enemy house'); right.appendChild(p); return; }
      const vs = clanVariants(state.house, NC), v = vs[state.variant] || vs[0];
      const C = CLAN_STYLE[state.house];
      right.append(scr, ft);
      const lab = document.createElement('div'); lab.className = 'tz-note'; lab.textContent = en ? '' : (C?.label || ''); scr.appendChild(lab);
      if (vs.length > 1) {
        const r = document.createElement('div'); r.className = 'tz-row';
        vs.forEach((x, i) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'tz-b'; b.textContent = `${HOUSE.find((h) => h.id === state.house)?.[en ? 'en' : 'name'].replace('家', '')}${x.name}${x.era ? '（' + x.era + '）' : ''}`; b.setAttribute('aria-pressed', String(i === state.variant)); b.onclick = () => { state.variant = i; drawRight(); }; r.appendChild(b); });
        scr.appendChild(r);
      }
      // 代表の4人（総大将・左翼・中央・右翼）。顔・名・レア
      const four = document.createElement('div'); four.className = 'tz-four';
      v.generals.slice(0, 4).forEach((n, i) => {
        const b = BUSHOU_ONLINE.find((q) => q.name === n);
        const g = document.createElement('div'); g.className = 'tz-g'; g.style.setProperty('--rc', RC[b?.rank] || RC.N);
        g.innerHTML = `<div class="f"></div><span>${esc(i === 0 ? W('総大将', 'General') : '')}</span><b>${esc(en ? tr(n) : n)}</b>`;
        if (H?.face) H.face(g.querySelector('.f'), n);
        four.appendChild(g);
      });
      scr.appendChild(four);
      // K608：家臣団（十人ほど）と兵力。初級・中級は自分と同じ出陣の数、上級は一隊・修羅は二隊多い
      const mine = Math.max(4, Math.min(16, ((H?.loadOnline?.() || {}).army || []).filter(Boolean).length || 4));
      const nFoe = Math.min(16, mine + (state.level === 'jokyu' ? 1 : state.level === 'shura' ? 2 : 0));
      const ret = retainersOf(state.house, NC);
      const kd = document.createElement('div'); kd.className = 'tz-note'; kd.style.cssText = 'opacity:1;font-size:12.5px;line-height:1.45';
      // K616（原理2）：兵力は数を並べず、敵（朱）と自軍（藍）の二本の棒で長さを比べる。数は棒の横に小さく
      // K638（kaito「何人連れて行けて…が分からない」）：前は一人千で数え、軍団の画面の総兵力（格で率いる兵）と合わなかった。自軍は軍団の武将の兵の和、敵は出る武将の兵の和に難易度の兵の倍（修羅 1.6 など）
      const tOf = (n) => troopsOf(BUSHOU_ONLINE.find((b) => b.name === n));
      const myArmy = ((H?.loadOnline?.() || {}).army || []).filter(Boolean).slice(0, 16);
      const foeNames = [...new Set([...v.generals, ...ret])].slice(0, nFoe);
      const myT = myArmy.reduce((a, n) => a + tOf(n), 0) || mine * 1000, foeT = Math.round(myT * (FOE_RATIO[state.level] || 1));   // K707：敵の総兵力は自軍×級の倍率（足りない将は一将の兵を増やして埋める）
      const mx = Math.max(foeT, myT), barRow = (t, n, k, col) => `<div class="tz-bar"><span style="width:3.2em;flex:none">${esc(t)}</span><i style="width:${Math.round(n / mx * 150)}px;background:${col}"></i><span>${n.toLocaleString()}（${k}${W('将', '')}）</span></div>`;
      kd.setAttribute('aria-label', W(`兵力 敵 ${nFoe}将 ${foeT} 自軍 ${myArmy.length || mine}将 ${myT}`, `Troops enemy ${foeT} yours ${myT}`));
      kd.innerHTML = barRow(W('敵', 'Enemy'), foeT, nFoe, '#c9563a') + barRow(W('自軍', 'Yours'), myT, myArmy.length || mine, '#4a72a8');
      const lvd = document.createElement('div'); lvd.className = 'tz-note'; lvd.style.cssText = 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis'; lvd.textContent = en ? LV_DESC_EN[state.level] : LV_DESC[state.level];
      scr.appendChild(kd); scr.appendChild(lvd);
      if (TK?.retainerCards) { const kh = document.createElement('div'); kh.className = 'tz-note'; kh.style.cssText = 'opacity:1;font-size:12.5px'; kh.innerHTML = `<b style="color:#ffd88a">${esc(W('家臣団', 'Retainers'))}</b>`; scr.appendChild(kh); scr.appendChild(TK.retainerCards(ret, { face: H?.face })); }   // K611 ①：家臣団を札で（顔・名・兵種・レア）
      else { const kr = document.createElement('div'); kr.className = 'tz-note'; kr.textContent = ret.map((n) => (en ? tr(n) : n)).join('・'); scr.appendChild(kr); }
      // 難易度（HP を増やさない＝考える速さと読み）
      const lv = document.createElement('div'); lv.className = 'tz-row';
      for (const k of LEVELS) { const b = document.createElement('button'); b.type = 'button'; b.className = 'tz-b'; b.dataset.level = k; b.textContent = en ? LV_EN[k] : NPC_LEVEL[k].label; b.setAttribute('aria-pressed', String(state.level === k)); b.onclick = () => { state.level = k; drawRight(); }; lv.appendChild(b); }
      ft.appendChild(lv);
      const mp = document.createElement('div'); mp.className = 'tz-row'; mp.style.gap = '6px';
      for (const m of MAPS) { const b = document.createElement('button'); b.type = 'button'; b.className = 'tz-b'; b.className = 'tz-b tz-mp'; b.dataset.map = m.id; const tc = mapThumb(TT?.terrainOf?.(m.id)); if (tc) b.appendChild(tc); b.append(en ? m.en : m.name); b.setAttribute('aria-pressed', String(state.map === m.id)); b.onclick = () => { state.map = m.id; drawRight(); }; mp.appendChild(b); }
      const go = document.createElement('button'); go.type = 'button'; go.className = 'tz-b tz-go'; go.textContent = W('布陣へ', 'To deployment');
      go.onclick = () => { close(); hooks.onNpc?.({ house: state.house, level: state.level, foe: v.generals.slice(0, 4), retainers: ret, nFoe, map: state.map, side: SIDES[state.map] ? state.side : null, practice, variant: v.id, ai: (NC?.NPC_CLAN_BY_ID?.[state.house] || null)?.ai || null, daily: pre?.kind && state.house === pre.house && v.id === pre.variant && state.map === pre.map && state.level === pre.level && (!pre.side || state.side === pre.side) ? { kind: pre.kind, id: pre.id } : null }); };
      lv.appendChild(go); go.style.marginLeft = 'auto';
      ft.appendChild(mp);
      if (SIDES[state.map]) {   // K628 ④：守る側・攻める側
        const sd = document.createElement('div'); sd.className = 'tz-row'; sd.style.gap = '6px';
        for (const k of ['def', 'atk']) { const b = document.createElement('button'); b.type = 'button'; b.className = 'tz-b'; b.dataset.side = k; b.textContent = SIDES[state.map][k][en ? 1 : 0]; b.setAttribute('aria-pressed', String(state.side === k)); b.onclick = () => { state.side = k; drawRight(); }; sd.appendChild(b); }
        ft.appendChild(sd);
      }
      // 戦場の名と一言（K608）
      const TM = TT?.terrainOf?.(state.map); const md = document.createElement('div'); md.className = 'tz-note';
      md.textContent = en ? '' : `${TM?.name || MAPS.find((m) => m.id === state.map)?.name || ''}：${TM?.desc || ''}`; scr.appendChild(md);
      if (practice) { const n = document.createElement('div'); n.className = 'tz-note'; n.textContent = W('褒美なし・段位は動かない', 'No rewards. Rank does not change.'); scr.appendChild(n); }
    }
    drawRight();
  }
  if (hooks.preset?.house) pickHouse(false, hooks.preset.house, hooks.preset); else entrance();
  return { close, el };
}
