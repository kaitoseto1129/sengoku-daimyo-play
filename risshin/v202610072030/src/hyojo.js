// 段2の一歩目（docs/phase2-plan.md）：戦に勝った後の「手柄の評定」で褒美を一つ選び、次の戦の前の「支度」で一つ整える。
// 褒美は G.owned・G.equip・G.tomo・G.stats を変える（次の戦から player.js・battle.js がそのまま読む）。
// 支度は G.shitaku = { at: 戦の番号, k } に覚え、その戦の始めに hyojoBattle が一度だけ効かせる。
// 保存は G の新しい欄（G.shitaku・G.hyojoLog）を足すだけ。state.js の save・load・migrate には触らない。
import { ITEMS, RANKS, BATTLES, TOMO, newTomo, tomoAlive, tomoCap, scenarioKey } from './state.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (id) => document.getElementById(id);
export const hyojoOn = (G) => !!G && !G.lord && !G.practice && scenarioKey() === 'oda';

// 褒美の武具：身の丈の順（安い守りから。身分の要る物は身分が来てから）
const GEAR_ORDER = ['kote', 'haidate', 'suneate', 'spear1', 'body1', 'hat2', 'katana', 'spear4', 'haori', 'body2', 'hat3'];
const SLOT_WORD = { weapon: '槍', hat: '兜', body: '胴', arm: '籠手', thigh: '佩楯', shin: '脛当', side: '刀', coat: '陣羽織' };

function nextGear(G) {
  const own = new Set(G.owned || []);
  for (const id of GEAR_ORDER) {
    const it = ITEMS[id];
    if (!it || own.has(id) || (it.minRank || 0) > (G.rank || 0)) continue;
    return id;
  }
  return null;
}
function gearEffect(it) {
  if (it.slot === 'weapon') return `突きが重くなる（${Math.round((it.mult - 1) * 100)}%増し）`;
  if (it.slot === 'side') return '槍の間合いの内で、刀に持ち替えて斬れる';
  if (it.slot === 'coat') return '組の士気が高いまま戦を始める';
  return `受ける傷が減る（守り ${Math.round((it.def || 0) * 100)}%）`;
}

// 褒美の候補（三つまで）。同じ戦の評定で何度開いても同じ物が出る
export function rewardOptions(G) {
  const L = [];
  const gid = nextGear(G);
  if (gid) {
    const it = ITEMS[gid];
    L.push({ k: 'gear', id: gid, cat: '武具', name: it.name, btn: `${it.name}を賜る`, eff: `次の戦から${gearEffect(it)}`, why: `${SLOT_WORD[it.slot] || '具足'}を良い物に替える` });
  }
  const room = tomoAlive(G).length < tomoCap(G);
  if (room) {
    const kind = (G.rank || 0) >= 2 ? 'wakato' : 'yarimochi';
    L.push({ k: 'tomo', kind, cat: '仲間', name: `${TOMO[kind].name}を一人`, btn: `${TOMO[kind].name}を供に付けてもらう`, eff: '次の戦から、すぐ後ろに付いて共に戦う', why: '同じ村の者が、手柄を聞いて仕えたいと言う' });
  } else if (!(G.rank >= 1) || G.feast) {
    const t = tomoAlive(G).filter((x) => (x.battles || 0) < 3).sort((a, b) => (a.battles || 0) - (b.battles || 0))[0];
    if (t) L.push({ k: 'tomoTrain', id: t.id, cat: '仲間', name: `供の${t.name}を鍛える`, btn: `${t.name}を鍛える`, eff: '次の戦から、その供が打たれ強く、よく突く', why: '戦の合間に、槍の相手をしてやる' });
  } else {
    L.push({ k: 'feast', cat: '仲間', name: '組の者に酒を振る舞う', btn: '組の者に酒を振る舞う', eff: '次の戦の始め、味方の士気が上がる', why: '褒美の酒を、皆で分ける' });
  }
  const st = G.stats || {};
  const sk = (st.spear || 1) <= (st.vit || 1) ? 'spear' : 'vit';
  L.push(sk === 'spear'
    ? { k: 'train', stat: 'spear', cat: '鍛錬', name: '古参に槍を習う', btn: '古参に槍を習う', eff: `突きが重くなる（槍術 ${st.spear || 1} → ${(st.spear || 1) + 1}）`, why: '上役の古参が、手ほどきを申し出た' }
    : { k: 'train', stat: 'vit', cat: '鍛錬', name: '走り込みで体を作る', btn: '走り込みで体を作る', eff: `体力と息が増える（体力 ${st.vit || 1} → ${(st.vit || 1) + 1}）`, why: '具足を着けて、山道を駆ける' });
  return L.slice(0, 3);
}

function applyReward(G, o) {
  if (o.k === 'gear') {
    const it = ITEMS[o.id];
    if (!G.owned.includes(o.id)) G.owned.push(o.id);
    if (it.slot in G.equip) {
      const cur = ITEMS[G.equip[it.slot]];
      if (!cur || (it.def || it.mult || 0) >= (cur.def || cur.mult || 0)) G.equip[it.slot] = o.id;
    }
    return `${it.name}を賜った`;
  }
  if (o.k === 'tomo') {
    const t = newTomo(G, o.kind);
    (G.tomo ||= []).push(t);
    return `${TOMO[o.kind].name}の${t.name}が供に付いた`;
  }
  if (o.k === 'tomoTrain') {
    const t = (G.tomo || []).find((x) => x.id === o.id);
    if (t) { t.battles = (t.battles || 0) + 1; return `供の${t.name}を鍛えた`; }
    return '';
  }
  if (o.k === 'feast') { G.feast = true; return '組の者に酒を振る舞った'; }
  if (o.k === 'train') {
    G.stats[o.stat] = (G.stats[o.stat] || 1) + 1;
    return o.stat === 'spear' ? `槍術が${G.stats.spear}に上がった` : `体力が${G.stats.vit}に上がった`;
  }
  return '';
}

const CSS = `<style>
#screen .hy{box-sizing:border-box;width:min(900px,100%);min-height:100dvh;margin:0 auto;padding:10px 0 12px;display:flex;flex-direction:column;gap:8px;color:var(--washi);text-align:left}
#screen .hy h2{margin:0;font-size:22px;color:var(--kin);letter-spacing:.08em}
#screen .hy .hy-sub{margin:0;font-size:15px;color:var(--washi-dim);line-height:1.5}
#screen .hy .hy-sub .v{color:var(--washi);font-weight:700}
#screen .hy .hy-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
#screen .hy .hy-c{display:flex;flex-direction:column;gap:3px;min-height:44px;margin:0;padding:8px 10px;border:1px solid rgba(194,162,90,.4);border-radius:8px;background:rgba(194,162,90,.06);color:var(--washi);font:inherit;text-align:left;cursor:pointer}
#screen .hy .hy-c[aria-pressed=true]{border:2px solid var(--kin);background:rgba(194,162,90,.18);padding:7px 9px}
#screen .hy .hy-c[disabled]{opacity:.38;cursor:default}
#screen .hy .hy-k{display:flex;justify-content:space-between;gap:8px;font-size:12px;color:var(--kin);letter-spacing:.12em}
#screen .hy .hy-n{font-size:16px;line-height:1.35;font-weight:700}
#screen .hy .hy-e{font-size:14px;line-height:1.45;color:var(--washi)}
#screen .hy .hy-w{font-size:13px;line-height:1.45;color:var(--washi-dim)}
#screen .hy .hy-act{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin-top:auto}
#screen .hy .hy-act .btn{min-height:48px;margin:0;font-size:15px}
#screen .hy .hy-c:focus-visible,#screen .hy .btn:focus-visible{outline:3px solid var(--focus-in,#e9c874);outline-offset:2px}
@media(max-width:640px){#screen .hy .hy-grid{grid-template-columns:minmax(0,1fr)}}
@media(max-height:430px){#screen .hy h2{font-size:19px}#screen .hy .hy-c{padding:6px 8px;gap:2px}#screen .hy .hy-c[aria-pressed=true]{padding:5px 7px}}
</style>`;

function open(html) {
  const s = $('screen');
  s.hidden = false; s.className = ''; s.style.paddingBottom = '';
  document.querySelectorAll('.tour').forEach((e) => e.remove());
  s.innerHTML = CSS + html; s.scrollTop = 0;
  document.title = `${s.querySelector('h2')?.textContent || ''}｜戦国立身`;
  return s;
}
function card(o, i, sel) {
  return `<button class="hy-c" data-hy="${i}" aria-pressed="${i === sel}"${o.lock ? ' disabled' : ''}><div class="hy-k"><div>${esc(o.cat)}</div><div>${i === sel ? '● 選んでいる' : '○ 選ぶ'}</div></div><div class="hy-n">${esc(o.name)}</div><div class="hy-e">${esc(o.eff)}</div><div class="hy-w">${esc(o.lock || o.why)}</div></button>`;
}
function pickable(sc, list, sel, onSel) {
  sc.querySelectorAll('[data-hy]').forEach((b) => {
    b.onclick = () => { const i = +b.dataset.hy; if (list[i].lock) return; onSel(i); };
  });
}

// 手柄の評定：主君の前で手柄を数えた後（論功行賞・昇進の後）、褒美を一つ選ぶ
export function hyojoScreen(G, r, onDone, save) {
  if (!hyojoOn(G) || !r || !r.mainDone) { onDone(); return; }
  const list = rewardOptions(G);
  let sel = 0, done = false;
  const draw = () => {
    const rank = RANKS[G.rank] || RANKS[0];
    const sc = open(`<section class="hy" aria-labelledby="hy-t"><h2 id="hy-t">手柄の評定</h2>
      <p class="hy-sub">${esc(r.battle)}。戦功 <span class="v">${r.total}</span>・評定 <span class="v">${esc(r.grade || '')}</span>。${r.promoted ? `<span class="v">${esc(rank.name)}</span>に取り立てられた。` : `いまは<span class="v">${esc(rank.name)}</span>。`}褒美を一つ選ぶ。</p>
      <div class="hy-grid" role="group" aria-label="褒美を一つ選ぶ">${list.map((o, i) => card(o, i, sel)).join('')}</div>
      <div class="hy-act"><button class="btn primary" id="hy-ok">${esc(list[sel].btn)}（受け取る）</button></div></section>`);
    pickable(sc, list, sel, (i) => { sel = i; draw(); $('hy-ok').focus({ preventScroll: true }); });
    $('hy-ok').onclick = () => {
      if (done) return; done = true;
      const msg = applyReward(G, list[sel]);
      G.hyojoLog = { at: G.battle, k: list[sel].k, msg };
      if (save) save(G);
      onDone(msg);
    };
    $('hy-ok').focus({ preventScroll: true });
  };
  draw();
}

// ---------------- 支度（次の戦の前に一つ整える） ----------------
function squadWord(G) {
  const sq = (RANKS[G.rank] || RANKS[0]).squad || 0;
  const tomo = tomoAlive(G).slice(0, tomoCap(G));
  if (sq) return { who: '組の者', eff: `組${sq}人の士気が高く、崩れにくい` };
  if (tomo.length) return { who: `供の${tomo.map((t) => t.name).join('・')}`, eff: '供が打たれ強く、よく突く' };
  return { who: '同じ組の足軽', eff: '近くの味方の士気が上がり、崩れにくい' };
}
export function shitakuOptions(G) {
  const w = ITEMS[G.equip.weapon] || ITEMS.spear0;
  const sw = squadWord(G);
  return [
    { k: 'togi', cat: '装備', name: `${w.name}の穂を研ぐ`, eff: 'この戦だけ、突きが一割ほど重い', why: '砥石で一晩かけて研ぐ' },
    { k: 'hyoro', cat: '装備', name: '腰兵糧を多めに持つ', eff: 'この戦だけ、息が長く続く（気力 +20%）', why: '干飯と味噌玉を腰に下げる' },
    { k: 'nakama', cat: '仲間', name: `${sw.who}と申し合わせる`, eff: `この戦だけ、${sw.eff}`, why: '互いの背を守る約束をする' },
  ];
}
export function shitakuScreen(G, onGo, onBack) {
  if (!hyojoOn(G)) { onGo(); return; }
  const list = shitakuOptions(G);
  const bi = BATTLES[G.battle];
  const prev = G.shitaku && G.shitaku.at === G.battle ? list.findIndex((o) => o.k === G.shitaku.k) : -1;
  let sel = prev >= 0 ? prev : 0, done = false;
  const draw = () => {
    const sc = open(`<section class="hy" aria-labelledby="hy-t"><h2 id="hy-t">出陣の支度</h2>
      <p class="hy-sub">次の戦：<span class="v">${esc(bi ? bi.name : '')}</span>${bi && bi.place ? `（${esc(bi.place)}）` : ''}。夜明けまでに、一つだけ整えられる。</p>
      <div class="hy-grid" role="group" aria-label="支度を一つ選ぶ">${list.map((o, i) => card(o, i, sel)).join('')}</div>
      <div class="hy-act">${onBack ? '<button class="btn" id="hy-back">城下へ戻る</button>' : ''}<button class="btn primary" id="b-next">${esc(list[sel].name)}で出陣する</button></div></section>`);
    pickable(sc, list, sel, (i) => { sel = i; draw(); $('b-next').focus({ preventScroll: true }); });
    if (onBack) $('hy-back').onclick = () => { if (!done) { done = true; onBack(); } };
    $('b-next').onclick = () => {
      if (done) return; done = true;
      G.shitaku = { at: G.battle, k: list[sel].k };
      onGo();
    };
    $('b-next').focus({ preventScroll: true });
  };
  draw();
}

// 戦の始め（realm.js の realmBattle から）：選んだ支度をこの戦にだけ効かせる
export function hyojoBattle(rt) {
  const G = rt.G, S0 = G.shitaku;
  if (!hyojoOn(G) || !S0 || S0.at !== rt.index || !rt.player) return;
  const p = rt.player;
  rt.shitaku = S0.k;
  let word = '';
  if (S0.k === 'togi') {
    const base = p.spearDmg.bind(p);
    p.spearDmg = () => base() * 1.12;
    word = '研いだ穂先で、突きが重い';
  } else if (S0.k === 'hyoro') {
    p.maxSta = Math.round(p.maxSta * 1.2); p.sta = p.maxSta;
    word = '腰兵糧で、息が長く続く';
  } else if (S0.k === 'nakama') {
    for (const u of rt.tomoUnits || []) { u.hp = u.maxHp = u.maxHp * 1.15; u.dmg *= 1.15; }
    // 組と近くの味方の隊は、組ができてから士気を上げる
    rt.after(1.5, () => {
      const P = p.u.pos, seen = new Set();
      for (const u of rt.squad || []) if (u.group) seen.add(u.group);
      if (!seen.size) for (const g of rt.army.groups || []) {
        if (g.team !== 0 || g.isTomo || !g.anchor) continue;
        if (Math.hypot(g.anchor.x - P.x, g.anchor.z - P.z) < 45) seen.add(g);
      }
      for (const g of seen) g.morale = Math.min(100, (g.morale || 0) + 10);
      rt.shitakuGroups = seen.size;
    });
    word = '申し合わせた味方が、崩れにくい';
  }
  if (word) rt.after(7, () => { if (!rt.over) rt.bark(`支度：${word}`); });
}
