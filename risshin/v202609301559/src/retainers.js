// 段2・係B：家臣。G.kerai を持つ。詳しくは docs/phase2-design.md の 3-B。
// このファイルは係B だけが直す。
import { addKan, zeni, BATTLES, scenario } from './state.js';
import { SEI, MEI, TRAIT_NOTE, BUSHO, LINEUP } from './generals_data.js';

export const KERAI_CAP = [0, 1, 2, 3, 5];

export function keraiOf(G) {
  if (!G.kerai) G.kerai = [];
  return G.kerai;
}

const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const STAT_I = { lea: 0, war: 1, int: 2, pol: 3 };
const STAT_LABEL = ['統', '武', '知', '政'];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---------------- 役目 ----------------
export const ROLES = {
  kumi: { name: '組の頭', minRank: 2, note: '組の先手の隊に入り、副頭を務める' },
  tegei: { name: '手勢の頭', minRank: 2, note: '手勢の隊に入り、崩れにくくする' },
  tomo: { name: '供に付く', minRank: 1, note: '供に交じって主を守る' },
  rusu: { name: '留守居', minRank: 2, note: '戦に出ず、年貢が増える' },
  shisha: { name: '使者', minRank: 2, note: '戦に出ず、調略の見込みが上がる' },
};

// ---------------- 種を使った決まった乱数（何度開いても同じ） ----------------
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
function yearNum(y) { const m = /（(\d+)）/.exec(y || ''); return m ? +m[1] : 9999; }

// 名の無い侍・郎党の候補を一人つくる
function commonCandidate(G, slot) {
  const rank = G.rank || 0;
  const r = rng((G.battle || 0) * 97 + slot * 131 + 7);
  const wakato = rank <= 1;
  const lo = wakato ? 35 : 40, hi = wakato ? 55 : 70 + 3 * rank;
  const used = new Set(keraiOf(G).map((k) => k.name));
  let sei, mei, name, tries = 0;
  do {
    sei = SEI[Math.floor(r() * SEI.length)];
    mei = MEI[Math.floor(r() * MEI.length)];
    name = sei + mei;
    tries++;
  } while (used.has(name) && tries < 8);
  const s = [0, 1, 2, 3].map(() => Math.round(lo + r() * (hi - lo)));
  const trKeys = Object.keys(TRAIT_NOTE);
  const tr = r() < 0.5 ? trKeys[Math.floor(r() * trKeys.length)] : '';
  return { key: 'c' + slot, name, s, tr, named: false, from: wakato ? '村の郎党' : '尾張の牢人' };
}

// 滅んだ家の旧臣（名のある人）。無ければ null
const RONIN_AT = {
  13: { lineup: 'hoi', houses: ['浅井家', '朝倉家'] },
  14: { lineup: 'hoi', houses: ['浅井家', '朝倉家'] },
  29: { lineup: 'nagashino', houses: ['武田家'] },
};
function roninCandidate(G) {
  const def = RONIN_AT[G.battle];
  if (!def) return null;
  const nowYear = yearNum((BATTLES[G.battle - 1] || {}).year);
  const used = new Set(keraiOf(G).map((k) => k.name));
  const pool = [];
  for (const house of def.houses) {
    const list = (LINEUP[def.lineup] || {})[house] || [];
    for (const name of list.slice(1)) {   // 先頭は当主なので外す
      const b = BUSHO[name];
      if (!b || used.has(name)) continue;
      const sum = b[3] + b[4] + b[5] + b[6];
      if (sum > 260 || b[2] <= nowYear) continue;
      pool.push({ name, b, house });
    }
  }
  if (!pool.length) return null;
  const r = rng((G.battle || 0) * 53 + 11);
  const pick = pool[Math.floor(r() * pool.length)];
  const tr = (pick.b[7] || '').split('・')[0] || '';
  return { key: 'c0', name: pick.name, s: [pick.b[3], pick.b[4], pick.b[5], pick.b[6]], tr, named: true, from: `${pick.house}旧臣` };
}

function candidateCost(c) {
  const sum = c.s.reduce((a, v) => a + v, 0);
  const mul = c.named ? 1.5 : 1;
  return { hire: Math.round((sum / 20) * mul * 10) / 10, pay: Math.round((sum / 100) * mul * 1000) / 1000 };
}

function candidates(G) {
  const cap = KERAI_CAP[G.rank || 0] || 0;
  const room = cap - keraiOf(G).filter((k) => k.alive).length;
  if (room <= 0) return [];
  const ronin = roninCandidate(G);
  const list = [ronin || commonCandidate(G, 0)];
  if (room > 1 || !ronin) list.push(commonCandidate(G, 1));
  return list.slice(0, Math.max(1, room)).filter((c, i, a) => a.findIndex((x) => x.name === c.name) === i);
}

function newLoy(tr) { return tr === '義理堅い' ? 80 : tr === '野心家' ? 45 : 60; }

// ---------------- 戦に出た家臣の成長（能力・二つ名） ----------------
const GOU = ['采配上手', '豪勇', '知恵者', '算用達者'];
function growKerai(G, r, k) {
  // 三戦に一度、いちばん低い能力が少し伸びる（上限99）
  if (k.battles % 3 === 0) {
    let i = 0; for (let j = 1; j < 4; j++) if (k.s[j] < k.s[i]) i = j;
    if (k.s[i] < 99) { k.s[i] = Math.min(99, k.s[i] + 2); r.realmLines.push(`${k.name}、${STAT_LABEL[i]}の技が上がった`); }
  }
  // 手柄を積んだ家臣には、得手にちなんだ二つ名が付く（一度だけ）
  if (!k.gou && k.kills >= 5) {
    let i = 0; for (let j = 1; j < 4; j++) if (k.s[j] > k.s[i]) i = j;
    k.gou = GOU[i];
    r.realmLines.push(`${k.name}に「${k.gou}」の二つ名が付いた`);
  }
}

// ---------------- 家臣の札（召し抱える・褒美・暇を出す） ----------------
// 召し抱えた時、空いている役目に就ける（役目が無いと戦に出ないため。後で替えられる）
function autoRole(G) {
  const rank = G.rank || 0;
  const taken = new Set(keraiOf(G).filter((k) => k.alive && k.role).map((k) => k.role));
  for (const r of ['kumi', 'tomo', 'tegei']) if (!taken.has(r) && rank >= ROLES[r].minRank) return r;
  return null;
}

export function actionCards(G) {
  const cards = [];
  for (const c of candidates(G)) {
    const cost = candidateCost(c);
    cards.push({
      id: `hire:${c.key}`, name: `${c.name}を召し抱える`, cost: cost.hire,
      eff: `${c.named ? c.from + '。' : ''}俸禄 ${zeni(cost.pay)}／戦。役目は後で決められる`,
      apply: (G2) => {
        keraiOf(G2).push({ id: Math.random().toString(36).slice(2, 8), name: c.name, named: c.named, s: c.s, tr: c.tr, pay: cost.pay, loy: newLoy(c.tr), role: autoRole(G2), battles: 0, kills: 0, alive: true, from: c.from });
      },
    });
  }
  const alive = keraiOf(G).filter((k) => k.alive);
  const rewardable = alive.filter((k) => k.loy < 100).sort((a, b) => a.loy - b.loy)[0];
  if (rewardable) {
    cards.push({
      id: `atae:${rewardable.id}`, name: `${rewardable.name}に褒美を与える`, cost: 5,
      eff: `忠義が上がる（今 ${rewardable.loy}）`,
      apply: (G2) => { const k = keraiOf(G2).find((x) => x.id === rewardable.id); if (k) k.loy = clamp(k.loy + 15, 0, 100); },
    });
  }
  return cards.slice(0, 3);
}

function dismissTarget(G) {
  const alive = keraiOf(G).filter((k) => k.alive);
  if (!alive.length) return null;
  return alive.sort((a, b) => a.loy - b.loy)[0];
}

export function keraiHtml(G) {
  const rank = G.rank || 0;
  const cap = KERAI_CAP[rank] || 0;
  if (cap <= 0) {
    return `<section class="kr" aria-label="家臣"><h3 class="realm-h">家臣</h3><p class="kr-note">足軽組頭候補になると、郎党を一人まで抱えられる</p></section>`;
  }
  const K = keraiOf(G);
  const alive = K.filter((k) => k.alive);
  const done = G.keraiAt === G.battle;
  let top;
  if (done) {
    top = `<div class="kr-card kr-done" role="group" aria-label="家臣の用は済んだ"><b class="kr-t"><span class="kr-dot" aria-hidden="true">●</span>済</b><p class="kr-x">${esc(G.keraiMsg || '')}</p></div>`;
  } else {
    const cards = actionCards(G);
    if (!cards.length) {
      top = `<p class="kr-note">今できる家臣の事は無い</p>`;
    } else {
      top = cards.map((c) => {
        const can = (G.kan || 0) >= c.cost;
        const btn = can
          ? `<button class="kr-btn" type="button" data-kr="${c.id}">${esc(c.name)}${c.cost ? `（${zeni(c.cost)}）` : ''}</button>`
          : `<button class="kr-btn" type="button" disabled aria-disabled="true">${esc(c.name)}<small>あと${zeni(c.cost - (G.kan || 0))}</small></button>`;
        return `<div class="kr-card"><b class="kr-t">${esc(c.name)}</b><p class="kr-x">${esc(c.eff)}</p>${btn}</div>`;
      }).join('');
    }
    const dt = dismissTarget(G);
    if (dt) {
      top += `<div class="kr-card"><b class="kr-t">${esc(dt.name)}に暇を出す</b><p class="kr-x">召し放つ（元に戻せません）</p><button class="kr-btn kr-btn-warn" type="button" data-kr="hima:${dt.id}">${esc(dt.name)}に暇を出す</button></div>`;
    }
  }
  const roster = alive.length
    ? alive.map((k) => rosterRow(G, k)).join('')
    : `<p class="kr-note">家臣はまだいない</p>`;
  return `<section class="kr" aria-label="家臣"><style>
.kr-note{font-size:13px;color:var(--washi-faint)}
.kr-card{background:rgba(236,228,210,.05);border:1px solid rgba(236,228,210,.15);border-radius:8px;padding:10px;margin-bottom:8px}
.kr-t{font-size:15px;color:var(--washi);display:block}
.kr-x{font-size:13px;color:var(--washi-dim);margin:4px 0 8px}
.kr-btn{min-height:44px;width:100%;border-radius:8px;border:1px solid var(--kin);background:rgba(194,162,90,.15);color:var(--washi);font-size:15px;padding:0 10px}
.kr-btn:disabled{opacity:.38;border-color:var(--washi-faint)}
.kr-btn small{display:block;font-size:12px;color:var(--washi-faint)}
.kr-btn-warn{border-color:var(--shu-text);color:var(--shu-text)}
.kr-done .kr-dot{color:var(--kin);margin-right:4px}
.kr-roster{margin-top:6px}
.kr-row{border-top:1px solid rgba(236,228,210,.12);padding:8px 0}
.kr-row-h{display:flex;justify-content:space-between;align-items:baseline;gap:6px;flex-wrap:wrap}
.kr-name{font-size:15px;color:var(--washi)}
.kr-stat{font-size:12px;color:var(--washi-dim)}
.kr-loy{font-size:12px;color:var(--washi-dim)}
.kr-roles{display:flex;flex-wrap:wrap;gap:8px;margin-top:6px}
.kr-role-btn{min-height:44px;flex:1 1 30%;border-radius:8px;border:1px solid var(--washi-faint);background:transparent;color:var(--washi-dim);font-size:13px;padding:0 6px}
.kr-role-btn[aria-pressed="true"]{border-color:var(--kin);color:var(--washi);background:rgba(194,162,90,.18)}
</style><h3 class="realm-h">家臣</h3>${top}
<div id="kr-cf"></div>
<div class="kr-roster"><p class="kr-note">上限 ${cap}人（今 ${alive.length}人）。役目は何度でも替えられる</p>${roster}</div>
</section>`;
}

function rosterRow(G, k) {
  const stat = k.s.map((v, i) => `${STAT_LABEL[i]}${v}`).join(' ');
  const rank = G.rank || 0;
  const roles = Object.entries(ROLES).filter(([, def]) => rank >= def.minRank);
  const pills = roles.map(([key, def]) => {
    const on = k.role === key;
    return `<button class="kr-role-btn" type="button" data-kr-role="${key}|${k.id}" aria-pressed="${on}">${esc(def.name)}${on ? '（今）' : ''}</button>`;
  }).join('');
  return `<div class="kr-row"><div class="kr-row-h"><b class="kr-name">${k.gou ? `${esc(k.gou)}・` : ''}${esc(k.name)}${k.named ? '（名のある士）' : ''}</b><span class="kr-loy">忠義 ${k.loy}</span></div>
<p class="kr-stat">${esc(stat)}${k.tr ? `　${esc(k.tr)}` : ''}　${esc(k.from)}</p>
<div class="kr-roles">${pills}<button class="kr-role-btn" type="button" data-kr-role="none|${k.id}" aria-pressed="${!k.role}">役目を外す</button></div>
</div>`;
}

export function keraiBind(G, done, confirm) {
  document.querySelectorAll('[data-kr]').forEach((btn) => {
    if (btn.disabled) return;
    const id = btn.getAttribute('data-kr');
    if (id.startsWith('hima:')) {
      btn.onclick = () => {
        if (G.keraiAt === G.battle) return;
        const kid = id.slice(5);
        const k = keraiOf(G).find((x) => x.id === kid);
        if (!k) return;
        const box = document.getElementById('kr-cf');
        confirm(box, `${k.name}に暇を出します。`, '暇を出す', () => {
          k.alive = false;
          G.keraiDead = [...(G.keraiDead || []), k.name];
          G.keraiAt = G.battle;
          G.keraiMsg = `${k.name}に暇を出した`;
          done(G.keraiMsg);
        });
      };
      return;
    }
    btn.onclick = () => {
      if (G.keraiAt === G.battle) return;
      const cards = actionCards(G);
      const c = cards.find((x) => x.id === id);
      if (!c) return;
      if ((G.kan || 0) < c.cost) return;
      if (c.cost) addKan(G, -c.cost);
      c.apply(G);
      G.keraiAt = G.battle;
      G.keraiMsg = `${c.name}。${c.eff}`;
      done(G.keraiMsg);
    };
  });
  document.querySelectorAll('[data-kr-role]').forEach((btn) => {
    btn.onclick = () => {
      const [role, kid] = btn.getAttribute('data-kr-role').split('|');
      const k = keraiOf(G).find((x) => x.id === kid);
      if (!k) return;
      if (role === 'none') { k.role = null; done(`${k.name}の役目を外した`, 'ui'); return; }
      for (const other of keraiOf(G)) if (other.id !== k.id && other.role === role) other.role = null;
      k.role = role;
      done(`${k.name}を${ROLES[role].name}にした`, 'ui');
    };
  });
}

// ---------------- 戦の中 ----------------
function byRole(G, role) {
  return keraiOf(G).find((k) => k.alive && k.role === role);
}
function buffGroup(g, mult) {
  for (const u of g.units) {
    if (!u.alive) continue;
    u.hp = u.maxHp = u.maxHp * mult;
    u.dmg *= mult;
  }
}
function spawnKerai(rt, g, k, o) {
  const dispName = k.gou ? `${k.gou}・${k.name}` : k.name;
  const [u] = rt.army.spawn(g, [{ type: 'samurai', n: 1, o: { name: dispName, flag: null, ...(o || {}) } }]);
  u.name = dispName; u.kerai = k; u.isSub = true;
  u.hp = u.maxHp = u.maxHp * (1 + k.s[1] / 300);
  u.dmg *= 1 + k.s[1] / 300;
  return u;
}

export function keraiBattle(rt) {
  const G = rt.G;
  if (!(KERAI_CAP[G.rank || 0] || 0)) return;
  rt.realm.keraiUnits = [];

  const kumi = byRole(G, 'kumi');
  if (kumi && rt.squadGroups && rt.squadGroups.length) {
    const g = rt.squadGroups[0];
    const u = spawnKerai(rt, g, kumi);
    rt.squad.push(u);
    g.fuku = u; u.fuku = true;
    buffGroup(g, 1 + kumi.s[1] / 400);
    g.morale = Math.min(100, (g.morale || 90) + kumi.s[0] / 10);
    rt.realm.keraiUnits.push({ k: kumi, u });
    rt.after(6, () => rt.say(kumi.name, '手前が副頭を務めまする', 3));
    rt.after(8, () => rt.bark(`${kumi.name}が組の副頭に立つ`));
  }

  const tegei = byRole(G, 'tegei');
  if (tegei && rt.realm.tegei) {
    const g = rt.realm.tegei;
    const u = spawnKerai(rt, g, tegei);
    buffGroup(g, 1 + tegei.s[0] / 400);
    g.morale = Math.min(100, (g.morale || 80) + 15);
    rt.realm.keraiUnits.push({ k: tegei, u });
    rt.after(8, () => rt.say(tegei.name, '手勢はそれがしが率いる', 3));
    rt.after(10, () => rt.bark(`${tegei.name}が手勢をまとめる`));
  }

  const tomo = byRole(G, 'tomo');
  if (tomo) {
    let g = rt.tomoGroup;
    if (!g) {
      const P = rt.player.u, h = P.heading || 0;
      g = rt.army.addGroup({ team: 0, faction: rt.G.lordFaction || scenario().faction, name: '家臣', order: 'follow', formation: 'line', facing: h,
        anchor: { x: P.pos.x - Math.sin(h) * 2, z: P.pos.z - Math.cos(h) * 2 }, noAI: true, noRout: true, aggro: 7, spacing: 1.4, width: 1, morale: 100 });
    }
    const u = spawnKerai(rt, g, tomo);
    rt.realm.keraiUnits.push({ k: tomo, u });
  }
}

export function keraiAfter(G, r, b, i) {
  if (!(KERAI_CAP[G.rank || 0] || 0)) return;
  const fought = (b.realm && b.realm.keraiUnits) || [];
  for (const { k, u } of fought) {
    if (u.alive) {
      k.battles++;
      k.kills += u.kills || 0;
      growKerai(G, r, k);
    } else if (k.alive) {
      k.alive = false;
      G.keraiDead = [...(G.keraiDead || []), k.name];
      r.realmLines.push(`家臣 ${k.name}、討死`);
    }
  }
  const foughtIds = new Set(fought.map((f) => f.k.id));
  for (const k of keraiOf(G).filter((x) => x.alive)) {
    const canPay = (G.kan || 0) >= k.pay;
    if (canPay) addKan(G, -k.pay);
    let delta = canPay ? 3 : -15;
    if (foughtIds.has(k.id)) delta += 2;
    k.loy = clamp(k.loy + delta, 0, 100);
    const floor = k.tr === '野心家' ? 40 : 30;
    if (k.loy < floor) {
      k.alive = false;
      G.keraiDead = [...(G.keraiDead || []), k.name];
      r.realmLines.push(`家臣 ${k.name}、出奔した`);
    }
  }
}

// その役目の生きた家臣で、stat（'lea'・'war'・'int'・'pol'）の値。居なければ 0
export function keraiBest(G, role, stat) {
  const k = byRole(G, role);
  return k ? k.s[STAT_I[stat]] : 0;
}
