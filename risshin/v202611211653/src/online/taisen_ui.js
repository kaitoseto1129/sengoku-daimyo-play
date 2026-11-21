// ［対戦］の入口と諸大名（NPC）の選び（K603 1〜10・58〜67・11/21 iMac k592）
//   ホーム →［対戦］→［オンライン対戦 他のプレイヤーと戦う］［諸大名と戦う NPC軍団と戦う］［模擬合戦 自分の軍団を試す］
//   諸大名：家と特徴 → 代表の4人（同じ家でも編成を幾つか・時代）→ 難易度（初級〜修羅）→ 戦場 →（布陣は index.js の toFujin）
//   模擬合戦：同じ選びで相手を自分で決める（褒美なし・段位は動かない）
//   家×時代の編成の表は online/npc_clans.js（codex が作る）があればそれを先に使い、無ければ登用の表（bushou_online.js）の初めの4人と、同じ家の上位の4人。
//   使い方：openTaisen({ onOnline(), onNpc({ house, level, foe, map, practice }), onBack() })
import { BUSHOU_ONLINE } from './bushou_online.js';
import { NPC_LEVEL, CLAN_STYLE } from './general_ai.js';
import { isEn, tr } from '../i18n.js';

const HOUSE = [
  { id: 'oda', name: '織田家', mon: 'oda', en: 'Oda' }, { id: 'takeda', name: '武田家', mon: 'takeda', en: 'Takeda' }, { id: 'uesugi', name: '上杉家', mon: 'uesugi', en: 'Uesugi' },
  { id: 'tokugawa', name: '徳川家', mon: 'tokugawa', en: 'Tokugawa' }, { id: 'mori', name: '毛利家', mon: 'mori', en: 'Mori' }, { id: 'shimazu', name: '島津家', mon: 'shimazu', en: 'Shimazu' },
  { id: 'date', name: '伊達家', mon: 'date', en: 'Date' }, { id: 'hojo', name: '北条家', mon: 'hojo', en: 'Hojo' }, { id: 'toyotomi', name: '豊臣家', mon: 'toyotomi', en: 'Toyotomi' },
];
// 家の特徴の短い言葉（K603 58）
const TRAIT = { oda: ['鉄砲', '攻勢'], takeda: ['騎馬', '高士気'], uesugi: ['波状攻撃', '機動'], tokugawa: ['防御', '予備'], mori: ['伏兵', '射撃'], shimazu: ['反転', '追撃'], date: ['騎馬', '鉄砲'], hojo: ['守り', '持久'], toyotomi: ['大軍', '包囲'] };
const TRAIT_EN = { 鉄砲: 'Guns', 攻勢: 'Offense', 騎馬: 'Cavalry', 高士気: 'High morale', 波状攻撃: 'Waves', 機動: 'Mobile', 防御: 'Defense', 予備: 'Reserves', 伏兵: 'Ambush', 射撃: 'Missiles', 反転: 'Feint', 追撃: 'Pursuit', 守り: 'Defense', 持久: 'Endurance', 大軍: 'Mass', 包囲: 'Encircle' };
const RANK = ['SS', 'S', 'A', 'R', 'N'];
const MAPS = [{ id: 'heigen', name: '平原', en: 'Plain' }, { id: 'kawa', name: '川と橋', en: 'River' }];
const LEVELS = ['shokyu', 'chukyu', 'jokyu', 'shura'];
const LV_EN = { shokyu: 'Easy', chukyu: 'Normal', jokyu: 'Hard', shura: 'Shura' };

/** 家の編成の候補：[{ id, name, era, generals:[4] }]。npc_clans.js の形（NPC_CLANS[house] = [{ id, name, era, generals }]）を先に */
export function clanVariants(house, NC) {
  // codex の npc_clans.js：NPC_CLANS＝[{ id:'oda', formations:[{ id, name, nameEn, year, generals:[登用の表の id] }] }]（NPC_CLAN_BY_ID もある）。
  //   名で書いた形（NPC_CLANS[house]＝[{ generals:[名] }]）も読む
  const byId = (x) => BUSHOU_ONLINE.find((b) => b.id === x)?.name || (BUSHOU_ONLINE.some((b) => b.name === x) ? x : null);
  const clan = NC?.NPC_CLAN_BY_ID?.[house] || (Array.isArray(NC?.NPC_CLANS) ? NC.NPC_CLANS.find((c) => c.id === house) : null);
  const ext = clan?.formations || (!Array.isArray(NC?.NPC_CLANS) ? NC?.NPC_CLANS?.[house] : null);
  if (Array.isArray(ext) && ext.length) {
    const vs = ext.map((v, i) => ({ id: v.id || `${house}${i}`, name: (isEn() ? v.nameEn : v.name) || v.name || '', era: v.year ? String(v.year) : v.era || '', generals: (v.generals || []).map(byId).filter(Boolean).slice(0, 6) })).filter((v) => v.generals.length >= 4);
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
.tz-go{margin-left:auto;background:linear-gradient(180deg,#a8402a,#6e2016);border-color:#e0a070;font-size:16px;letter-spacing:.1em}`;

const RC = { SS: '#e0b84a', S: '#c9563a', A: '#4f8f55', R: '#4a72a8', N: '#8a8478' };
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function openTaisen(hooks = {}) {
  const en = isEn(), W = (j, e) => (en ? e : j);
  const el = document.createElement('div'); el.className = 'tz'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', W('対戦', 'Battle'));
  const st = document.createElement('style'); st.textContent = CSS; el.appendChild(st);
  const body = document.createElement('div'); body.style.cssText = 'flex:1;display:flex;flex-direction:column;min-height:0'; el.appendChild(body);
  document.body.appendChild(el);
  let H = null, NC = null;
  let RW = null, MI = null, TI = null;
  const ready = Promise.all([import('./house.js').then((m) => (H = m)).catch(() => null), import('./npc_clans.js').then((m) => (NC = m)).catch(() => null),
    import('./npc_reward.js').then((m) => (RW = m)).catch(() => null), import('./michi.js').then((m) => (MI = m)).catch(() => null), import('./npc_titles_ui.js').then((m) => (TI = m)).catch(() => null)]);
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
    const box = document.createElement('div'); box.className = 'tz-three';
    const big = (k, t, s, main) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'tz-big' + (main ? ' main' : ''); b.dataset.k = k; b.innerHTML = `<b>${esc(t)}</b><span>${esc(s)}</span>`; box.appendChild(b); return b; };
    big('online', W('オンライン対戦', 'Online battle'), W('他のプレイヤーと戦う', 'Fight other players'), true).onclick = () => { close(); hooks.onOnline?.(); };
    big('npc', W('諸大名と戦う', 'Fight the warlords'), W('NPC軍団と戦う', 'Fight an NPC army')).onclick = () => pickHouse(false);
    big('practice', W('模擬合戦', 'Practice battle'), W('自分の軍団を試す', 'Test your army')).onclick = () => pickHouse(true);
    body.appendChild(box);
    // 初心者の道（k598-home の michi.js）：模擬合戦→織田 初級→武田 中級→対人。全部済めば出さない
    ready.then(() => { const st0 = MI?.michiStrip?.(save()); if (st0 && box.isConnected) { st0.style.cssText += ';justify-content:center;padding-bottom:10px'; body.appendChild(st0); } });
  }

  // ② 家と特徴 → 代表の4人・難易度・戦場（一つの画面で選ぶ）
  async function pickHouse(practice, sel = null) {
    await ready;
    body.innerHTML = '';
    const tp = top(practice ? W('模擬合戦', 'Practice battle') : W('諸大名と戦う', 'Fight the warlords'), entrance);
    if (TI?.openTitles && !practice) { const tb = document.createElement('button'); tb.type = 'button'; tb.className = 'tz-b'; tb.style.marginLeft = 'auto'; tb.textContent = W('称号', 'Titles'); tb.onclick = () => TI.openTitles(() => {}); tp.appendChild(tb); }
    body.appendChild(tp);
    const pane = document.createElement('div'); pane.className = 'tz-pane'; body.appendChild(pane);
    const grid = document.createElement('div'); grid.className = 'tz-grid'; grid.style.cssText = 'flex:0 0 44%';
    const right = document.createElement('div'); right.className = 'tz-col'; right.style.flex = '1';
    pane.append(grid, right);
    const state = { house: sel, variant: 0, level: 'chukyu', map: 'heigen' };
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
      if (!state.house) { const p = document.createElement('p'); p.className = 'tz-note'; p.textContent = W('相手の家を選ぶ', 'Choose the enemy house'); right.appendChild(p); return; }
      const vs = clanVariants(state.house, NC), v = vs[state.variant] || vs[0];
      const C = CLAN_STYLE[state.house];
      const lab = document.createElement('div'); lab.className = 'tz-note'; lab.textContent = en ? '' : (C?.label || ''); right.appendChild(lab);
      if (vs.length > 1) {
        const r = document.createElement('div'); r.className = 'tz-row';
        vs.forEach((x, i) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'tz-b'; b.textContent = `${HOUSE.find((h) => h.id === state.house)?.[en ? 'en' : 'name'].replace('家', '')}${x.name}${x.era ? '（' + x.era + '）' : ''}`; b.setAttribute('aria-pressed', String(i === state.variant)); b.onclick = () => { state.variant = i; drawRight(); }; r.appendChild(b); });
        right.appendChild(r);
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
      right.appendChild(four);
      // 難易度（HP を増やさない＝考える速さと読み）
      const lv = document.createElement('div'); lv.className = 'tz-row';
      for (const k of LEVELS) { const b = document.createElement('button'); b.type = 'button'; b.className = 'tz-b'; b.dataset.level = k; b.textContent = en ? LV_EN[k] : NPC_LEVEL[k].label; b.setAttribute('aria-pressed', String(state.level === k)); b.onclick = () => { state.level = k; drawRight(); }; lv.appendChild(b); }
      right.appendChild(lv);
      const mp = document.createElement('div'); mp.className = 'tz-row';
      for (const m of MAPS) { const b = document.createElement('button'); b.type = 'button'; b.className = 'tz-b'; b.dataset.map = m.id; b.textContent = en ? m.en : m.name; b.setAttribute('aria-pressed', String(state.map === m.id)); b.onclick = () => { state.map = m.id; drawRight(); }; mp.appendChild(b); }
      const go = document.createElement('button'); go.type = 'button'; go.className = 'tz-b tz-go'; go.textContent = W('布陣へ', 'To deployment');
      go.onclick = () => { close(); hooks.onNpc?.({ house: state.house, level: state.level, foe: v.generals.slice(0, 4), map: state.map, practice, variant: v.id, ai: (NC?.NPC_CLAN_BY_ID?.[state.house] || null)?.ai || null }); };
      mp.appendChild(go);
      right.appendChild(mp);
      if (practice) { const n = document.createElement('div'); n.className = 'tz-note'; n.textContent = W('褒美なし・段位は動かない', 'No rewards. Rank does not change.'); right.appendChild(n); }
    }
    drawRight();
  }
  entrance();
  return { close, el };
}
