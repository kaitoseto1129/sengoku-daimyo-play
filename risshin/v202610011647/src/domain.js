// 段2・係A：内政と知行。G.dom を持つ。詳しくは docs/phase2-design.md の 3-A。
// このファイルは係A だけが直す。
import { addKan, zeni, BATTLES, scenario } from './state.js';
import { keraiBest } from './retainers.js';

const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

// 身分（RANKS の番号）で届く知行の下限（石）。0・1は無し、2組頭=30、3大将候補=60、4大将=100
const KOKU_FLOOR = [0, 0, 30, 60, 100];
const KOKU_MAX = 1000;

// 城下（town）ごとの国。知行の村の名はここから引く
const TOWN_KUNI = { 清洲: '尾張', 小牧山: '尾張', 岐阜: '美濃', 安土: '近江' };
const VILLAGES = {
  尾張: ['春日井郡 味鋺村', '丹羽郡 楽田村', '中島郡 起村', '葉栗郡 黒田村'],
  美濃: ['厚見郡 加納村', '本巣郡 織部村', '席田郡 河渡村', '安八郡 墨俣村'],
  近江: ['蒲生郡 円山村', '神崎郡 五個荘村', '甲賀郡 石部村', '高島郡 今津村'],
};
function pickVillage(G) {
  const town = (BATTLES[G.battle] && BATTLES[G.battle].town) || '清洲';
  const kuni = TOWN_KUNI[town] || '尾張';
  const list = VILLAGES[kuni];
  const seed = (G.name || 'つ').length * 7 + (G.battle || 0);
  return list[seed % list.length];
}

export function domOf(G) {
  if (!G.dom) {
    G.dom = { koku: 0, mura: '', ta: 0, machi: 0, hei: 0, ren: 0, hatake: false, tsukuroi: false, gunsmith: false, hyourou: false, at: -1, lastMsg: '' };
    // 段2の前からの保存（すでに組頭以上）は、初めの一回で知行を届ける
    if ((G.rank || 0) >= 2) { G.dom.koku = KOKU_FLOOR[G.rank] || 100; G.dom.mura = pickVillage(G); }
  }
  return G.dom;
}
export function kokuOf(G) { return domOf(G).koku; }
export function villageOf(G) { return domOf(G).mura; }

// ---------------- 内政の札 ----------------
const CARDS = [
  { id: 'chohei', name: '兵を集める', minRank: 2, cost: 2,
    eff: (D) => `次の戦から、手勢${Math.min(4, heiRoom(D))}人が増える`,
    avail: (G, D) => heiRoom(D) > 0,
    apply: (G, D) => { D.hei += Math.min(4, heiRoom(D)); } },
  { id: 'kaikon', name: '田を開く', minRank: 2, cost: 3,
    eff: () => '次の戦から、田が一枚増える（年貢が一割増える）',
    avail: (G, D) => D.ta < 5,
    apply: (G, D) => { D.ta++; } },
  { id: 'machi', name: '町を開く', minRank: 3, cost: 5,
    eff: () => '次の戦から、町が一つ増える（毎戦＋1貫。町2から手勢の四人に一人が鉄砲になる）',
    avail: (G, D) => D.machi < 5,
    apply: (G, D) => { D.machi++; } },
  { id: 'kunren', name: '手勢を鍛える', minRank: 3, cost: 2,
    eff: () => '次の戦から、手勢の練度が上がる（強さ＋8割増しまで）',
    avail: (G, D) => D.ren < 3 && D.hei > 0,
    apply: (G, D) => { D.ren++; } },
  { id: 'tsukuroi', name: '具足を繕う', minRank: 0, cost: 1,
    eff: () => '次の戦だけ、自分の体力が増える',
    avail: () => true,
    apply: (G, D) => { D.tsukuroi = true; } },
  { id: 'hatake', name: '屋敷の畑を耕す', minRank: 0, maxRank: 1, cost: 0,
    eff: () => 'これからは戦のたびに、畑の実りが入る',
    avail: (G, D) => !D.hatake,
    apply: (G, D) => { D.hatake = true; } },
  { id: 'teppokaji', name: '鉄砲鍛冶を呼ぶ', minRank: 3, cost: 6,
    eff: () => 'これからは、手勢の半ばが鉄砲になる',
    avail: (G, D) => !D.gunsmith,
    apply: (G, D) => { D.gunsmith = true; } },
  { id: 'hyourou', name: '兵糧を蓄える', minRank: 2, cost: 3,
    eff: () => '次の戦だけ、長く戦っても気力が落ちにくい',
    avail: () => true,
    apply: (G, D) => { D.hyourou = true; } },
];
function heiRoom(D) { return Math.max(0, Math.min(12, Math.floor((D.koku || 0) / 10)) - D.hei); }

function priorityOrder(D) {
  const base = ['kaikon', 'machi', 'teppokaji', 'kunren', 'chohei', 'hyourou', 'tsukuroi', 'hatake'];
  return D.hei === 0 ? ['chohei', ...base.filter((x) => x !== 'chohei')] : base;
}

export function domainCards(G) {
  const D = domOf(G);
  const rank = G.rank || 0;
  const on = CARDS.filter((c) => rank >= c.minRank && (c.maxRank === undefined || rank <= c.maxRank) && c.avail(G, D));
  const order = priorityOrder(D);
  on.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  return on.slice(0, 3);
}

export function domainHtml(G) {
  const D = domOf(G);
  const done = D.at === G.battle;
  let list;
  if (done) {
    list = `<div class="dm-card dm-done" role="group" aria-label="内政は済んだ"><b class="dm-t"><span class="dm-dot" aria-hidden="true">●</span>済</b><p class="dm-x">${esc(D.lastMsg)}</p></div>`;
  } else {
    const cards = domainCards(G);
    list = cards.length ? cards.map((c, i) => {
      const can = (G.kan || 0) >= c.cost;
      const rec = i === 0 && cards.length > 1 && can;
      const btn = can
        ? `<button class="dm-btn" type="button" data-dm="${c.id}">${esc(c.name)}${c.cost ? `（${zeni(c.cost)}）` : ''}</button>`
        : `<button class="dm-btn" type="button" disabled aria-disabled="true">${esc(c.name)}<small>あと${zeni(c.cost - (G.kan || 0))}</small></button>`;
      return `<div class="dm-card${rec ? ' dm-rec' : ''}">${rec ? '<span class="dm-badge">おすすめ</span>' : ''}<b class="dm-t">${esc(c.name)}</b><p class="dm-x">${esc(c.eff(D))}</p>${btn}</div>`;
    }).join('') : '<p class="dm-note">今できる内政は無い</p>';
  }
  const muraLine = D.mura ? `<p class="dm-mura">知行地：${esc(D.mura)}　${D.koku}石</p>` : '';
  return `<section class="dm" aria-label="内政">
<style>
.dm-mura{font-size:13px;color:var(--washi-dim);margin:0 0 6px}
.dm-card{position:relative;background:rgba(236,228,210,.05);border:1px solid rgba(236,228,210,.15);border-radius:8px;padding:10px;margin-bottom:8px}
.dm-rec{border-color:var(--kin);background:rgba(194,162,90,.1)}
.dm-badge{position:absolute;top:-9px;right:8px;font-size:11px;color:#14110d;background:var(--kin);border-radius:4px;padding:1px 6px}
.dm-t{font-size:15px;color:var(--washi);display:block}
.dm-x{font-size:13px;color:var(--washi-dim);margin:4px 0 8px}
.dm-btn{min-height:44px;width:100%;border-radius:8px;border:1px solid var(--kin);background:rgba(194,162,90,.15);color:var(--washi);font-size:15px;padding:0 10px}
.dm-btn:disabled{opacity:.38;border-color:var(--washi-faint)}
.dm-btn small{display:block;font-size:12px;color:var(--washi-faint)}
.dm-note{font-size:13px;color:var(--washi-faint)}
.dm-done .dm-dot{color:var(--kin);margin-right:4px}
</style>
<h3 class="realm-h">内政</h3>${muraLine}<div class="dm-list">${list}</div>
</section>`;
}

export function domainBind(G, done, confirm) {
  document.querySelectorAll('[data-dm]').forEach((btn) => {
    if (btn.disabled) return;
    btn.onclick = () => {
      const D = domOf(G);
      if (D.at === G.battle) return;
      const id = btn.getAttribute('data-dm');
      const c = CARDS.find((x) => x.id === id);
      if (!c) return;
      if ((G.kan || 0) < c.cost) return;
      const msg = `${c.name}。${c.eff(D)}`;
      if (c.cost) addKan(G, -c.cost);
      c.apply(G, D);
      D.at = G.battle;
      D.lastMsg = msg;
      done(msg);
    };
  });
}

// ---------------- 戦の中 ----------------
export function domainBattle(rt) {
  const G = rt.G, D = domOf(G);
  if (D.tsukuroi) {
    rt.player.u.maxHp *= 1.08;
    rt.player.u.hp = rt.player.u.maxHp;
    D.tsukuroi = false;
  }
  if (D.hyourou) {
    rt.player.maxSta *= 1.3;
    rt.player.sta = rt.player.maxSta;
    D.hyourou = false;
  }
  if (D.hei > 0) {
    const aliveNow = rt.army.units.filter((u) => u.alive).length;
    const n = Math.max(0, Math.min(D.hei, 235 - aliveNow));
    if (n > 0) {
      const P = rt.player.u, h = P.heading || 0;
      const g = rt.army.addGroup({
        team: 0, faction: rt.G.lordFaction || scenario().faction, formation: 'line', facing: h,
        anchor: { x: P.pos.x - Math.sin(h) * 5, z: P.pos.z - Math.cos(h) * 5 }, aggro: 8, spacing: 1.5, morale: 80, noRout: false,
      });
      g.kind = 'tegei'; g.fire = true;
      const gunN = D.gunsmith ? Math.round(n / 2) : D.machi >= 2 ? Math.round(n / 4) : 0;
      const ashiN = n - gunN;
      const units = [];
      if (ashiN) units.push(...rt.army.spawn(g, [{ type: 'ashigaru', n: ashiN, o: { flag: null } }]));
      if (gunN) units.push(...rt.army.spawn(g, [{ type: 'gun', n: gunN, o: { flag: null } }]));
      const mult = 1 + 0.08 * D.ren;
      for (const u of units) { u.hp = u.maxHp = u.maxHp * mult; u.dmg *= mult; u.isHei = true; u.isSub = true; u.kills = 0; }
      rt.realm.tegei = g;
      rt.realm.heiN = n;
      rt.after(6, () => rt.bark(`手勢${n}人が後ろに付く`));
    }
  }
}

export function domainAfter(G, r, b, i) {
  const D = domOf(G);
  // 加増・初めの知行
  if ((G.rank || 0) >= 2) {
    if (!D.mura) {
      D.mura = pickVillage(G);
      D.koku = Math.max(D.koku, KOKU_FLOOR[G.rank] || 100);
      r.realmLines.push(`${D.mura}に知行${D.koku}石を賜った`);
    } else {
      const floor = KOKU_FLOOR[G.rank] || 100;
      if (D.koku < floor) { D.koku = floor; r.realmLines.push(`知行が${D.koku}石に上がった`); }
    }
    const add = { 甲上: 20, 甲: 10, 乙: 5, 丙: 0 }[r.grade] || 0;
    if (add > 0 && D.koku < KOKU_MAX) { D.koku = Math.min(KOKU_MAX, D.koku + add); r.realmLines.push(`加増　${add}石（${r.grade}の働き）`); }
  }
  // 手勢の損耗と働き（討ち取った数は戦功の「部下の撃破」にも入る）
  if (b.realm && b.realm.tegei && b.realm.heiN) {
    const alive = b.realm.tegei.units.filter((u) => u.alive).length;
    const lost = Math.max(0, b.realm.heiN - alive);
    const killed = b.realm.tegei.units.reduce((a, u) => a + (u.kills || 0), 0);
    if (killed) r.realmLines.push(`手勢の働きで敵${killed}人を討ち取った`);
    if (lost) { D.hei = Math.max(0, D.hei - lost); r.realmLines.push(`手勢のうち${lost}人が討たれた`); }
  }
  // 年貢・町の銭・畑
  if (D.koku > 0) {
    const pol = keraiBest(G, 'rusu', 'pol');
    const nen = Math.round(D.koku * 0.05 * (1 + 0.1 * D.ta) * (1 + pol / 500) * 1000) / 1000;
    if (nen) { addKan(G, nen); r.realmLines.push(`年貢　${zeni(nen)}`); }
  }
  if (D.machi) { addKan(G, D.machi); r.realmLines.push(`町の銭　${zeni(D.machi)}`); }
  if (D.hatake) { addKan(G, 0.5); r.realmLines.push(`屋敷の畑から　${zeni(0.5)}`); }
  // 手勢の扶持
  if (D.hei > 0) {
    const wage = Math.round(D.hei * 0.2 * 1000) / 1000;
    if ((G.kan || 0) >= wage) { addKan(G, -wage); r.realmLines.push(`手勢の扶持　−${zeni(wage)}`); }
    else {
      let left = wage - (G.kan || 0), goneN = 0;
      G.kan = 0;
      while (left > 0 && D.hei > 0) { D.hei--; left -= 0.2; goneN++; }
      if (goneN) r.realmLines.push(`扶持が払えず、手勢${goneN}人が去った`);
    }
  }
}
