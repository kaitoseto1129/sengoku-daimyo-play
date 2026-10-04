// 段2・係B：家臣。G.kerai を持つ。詳しくは docs/phase2-design.md の 3-B。
// このファイルは係B だけが直す。
import { addKan, zeni, BATTLES, scenario } from './state.js';
import { SEI, MEI, TRAIT_NOTE, BUSHO, LINEUP } from './generals_data.js';

import { styleOnce } from './style_once.js';
export const KERAI_CAP = [0, 1, 2, 3, 5];

export function keraiOf(G) {
  if (!G.kerai) G.kerai = [];
  return G.kerai;
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const STAT_I = { lea: 0, war: 1, int: 2, pol: 3 };
const STAT_LABEL = ['統率', '武勇', '知略', '政治'];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ARMS = { spear: { name: '槍', type: 'ashigaru' }, bow: { name: '弓', type: 'bow' }, gun: { name: '鉄砲', type: 'gun' } };
// 古い保存にもここで補う。兵の本体は入れず、家臣の値だけを今の保存に載せる。
function skillsOf(k) {
  if (!k.skills) k.skills = { spear: Math.round(k.s[1] / 2), bow: Math.round(k.s[1] / 2), gun: Math.round(k.s[1] / 2) };
  if (!k.skillMerit) k.skillMerit = { spear: 0, bow: 0, gun: 0, lea: 0 };
  for (const key of ['spear', 'bow', 'gun', 'lea']) if (!Number.isFinite(k.skillMerit[key])) k.skillMerit[key] = 0;
  if (!ARMS[k.arm]) k.arm = 'spear';
  return k.skills;
}

// ---------------- 役目 ----------------
export const ROLES = {
  kumi: { name: '組の頭', minRank: 2, note: '組の先手の隊に入り、副頭を務める' },
  tegei: { name: '手勢の頭', minRank: 2, note: '手勢の隊に入り、崩れにくくする' },
  tomo: { name: '横に付いて戦う', minRank: 1, note: '主のすぐそばで戦う。討たれると戻らない' },
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
  tonezaka: { lineup: 'hoi', houses: ['朝倉家'] },
  odani: { lineup: 'hoi', houses: ['浅井家'] },
  tano: { lineup: 'nagashino', houses: ['武田家'] },
};
function roninCandidate(G) {
  const prev = BATTLES[(G.battle || 0) - 1];
  const def = prev && RONIN_AT[prev.id];
  if (!def) return null;
  const nowYear = yearNum(prev.year);
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
  return list.filter((c, i, a) => a.findIndex((x) => x.name === c.name) === i);
}

function newLoy(tr) { return tr === '義理堅い' ? 80 : tr === '野心家' ? 45 : 60; }

// ---------------- 戦に出た家臣の成長（能力・二つ名） ----------------
const GOU = ['采配上手', '豪勇', '知恵者', '算用達者'];
function growKerai(G, r, k, u) {
  const skills = skillsOf(k), arm = u.keraiArm || k.arm;
  const merit = 1 + Math.min(6, u.kills || 0);
  k.skillMerit[arm] += merit;
  k.skillMerit.lea += merit;
  const gains = [];
  const step = (key, need, label) => {
    const n = Math.floor(k.skillMerit[key] / need);
    k.skillMerit[key] %= need;
    const before = key === 'lea' ? k.s[0] : skills[key];
    const after = Math.min(99, before + n);
    if (key === 'lea') k.s[0] = after; else skills[key] = after;
    if (after > before) gains.push(`${label}${before}から${after}`);
  };
  step(arm, 3, ARMS[arm].name);
  step('lea', 5, '統率');
  k.lastGrowth = gains.join('・');
  if (gains.length) r.realmLines.push(`${k.name}、手柄で育った（${k.lastGrowth}）`);
  // 三戦に一度、いちばん低い能力が少し伸びる（上限99）
  if (k.battles % 3 === 0) {
    let i = 0; for (let j = 1; j < 4; j++) if (k.s[j] < k.s[i]) i = j;
    if (k.s[i] < 99) { k.s[i] = Math.min(99, k.s[i] + 2); r.realmLines.push(`${k.name}、${STAT_LABEL[i]}が上がった（${k.s[i]}）`); }
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
  for (const r of ['tomo', 'kumi', 'tegei', 'rusu', 'shisha']) if (!taken.has(r) && rank >= ROLES[r].minRank) return r;
  return null;
}

const actionTargets = new WeakMap();
function actionTarget(G) {
  const alive = keraiOf(G).filter((k) => k.alive);
  return alive.find((k) => k.id === actionTargets.get(G)) || alive.sort((a, b) => a.loy - b.loy)[0];
}

export function actionCards(G) {
  const cards = [];
  const target = actionTarget(G);
  for (const c of candidates(G).slice(0, target ? 1 : 2)) {
    const cost = candidateCost(c);
    cards.push({
      id: `hire:${c.key}`, name: `${c.name}を召し抱える`, cost: cost.hire,
      stats: c.s.map((v, i) => `${STAT_LABEL[i]}${v}`).join('・') + (c.tr ? `。${c.tr}` : ''),
      eff: `次の戦で${autoRole(G) ? ROLES[autoRole(G)].name + 'を務める' : '役目を決めると働く'}。${c.named ? c.from + 'を与力として預かる。' : ''}俸禄は毎戦${zeni(cost.pay)}`,
      apply: (G2) => {
        keraiOf(G2).push({ id: Math.random().toString(36).slice(2, 8), name: c.name, named: c.named, s: c.s, tr: c.tr, pay: cost.pay, loy: newLoy(c.tr), role: autoRole(G2), battles: 0, kills: 0, alive: true, from: c.from });
      },
    });
  }
  const rewardable = target && target.loy < 100 ? target : null;
  if (rewardable) {
    cards.push({
      id: `atae:${rewardable.id}`, name: `${rewardable.name}に褒美を与える`, cost: 5,
      eff: `次の戦に向けて忠義が15上がる（${rewardable.loy}から${Math.min(100, rewardable.loy + 15)}）`,
      apply: (G2) => { const k = keraiOf(G2).find((x) => x.id === rewardable.id); if (k) k.loy = clamp(k.loy + 15, 0, 100); },
    });
  }
  if (target) cards.push({
    id: `hima:${target.id}`, name: `${target.name}に暇を出す`, cost: 0, confirm: true,
    eff: '次の戦から家臣を離れる。元に戻せません',
    apply: (G2) => {
      const k = keraiOf(G2).find((x) => x.id === target.id && x.alive);
      if (k) leaveKerai(G2, k, '暇を出した');
    },
  });
  return cards.slice(0, 3);
}

function leaveKerai(G, k, reason) {
  k.alive = false; k.left = reason; k.role = null;
  G.keraiDead = [...new Set([...(G.keraiDead || []), k.name])];
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
      const target = actionTarget(G);
      const pick = alive.length > 1 ? `<label class="kr-note">褒美・暇の相手<select class="kr-btn" data-kr-target>${alive.map((k) => `<option value="${esc(k.id)}"${k.id === target.id ? ' selected' : ''}>${esc(k.name)}（忠義 ${k.loy}）</option>`).join('')}</select></label>` : '';
      top = pick + cards.map((c, i) => {
        const can = (G.kan || 0) >= c.cost;
        const rec = i === 0 && cards.length > 1 && can;
        const btn = can
          ? `<button class="kr-btn${c.confirm ? ' kr-btn-warn' : ''}" type="button" data-kr="${c.id}">${esc(c.name)}${c.cost ? `（${zeni(c.cost)}）` : ''}</button>`
          : `<button class="kr-btn" type="button" disabled aria-disabled="true">${esc(c.name)}<small>あと${zeni(c.cost - (G.kan || 0))}</small></button>`;
        return `<div class="kr-card${rec ? ' kr-rec' : ''}">${rec ? '<span class="kr-badge">おすすめ</span>' : ''}<b class="kr-t">${esc(c.name)}</b>${c.stats ? `<p class="kr-stat">${esc(c.stats)}</p>` : ''}<p class="kr-x">${esc(c.eff)}</p>${btn}</div>`;
      }).join('');
    }

  }
  const roster = alive.length
    ? alive.map((k) => rosterRow(G, k)).join('')
    : `<p class="kr-note">家臣はまだいない</p>`;
  const wages = alive.reduce((n, k) => n + k.pay, 0);
  const past = K.filter((k) => !k.alive).slice(-3);
  const history = past.length ? `<p class="kr-note">離れた家臣：${past.map((k) => `${esc(k.name)}（${esc(k.left || '家を離れた')}・${k.kills || 0}人討ち取り）`).join('、')}</p>` : '';
  return `<section class="kr" aria-label="家臣">${styleOnce('kr', `<style>
.kr-note{font-size:13px;color:var(--washi-dim)}
select.kr-btn{display:block;margin:8px 0;background:var(--sumi,#1c1914)}
.kr-card{position:relative;background:rgba(236,228,210,.05);border:1px solid rgba(236,228,210,.15);border-radius:8px;padding:10px;margin-bottom:8px}
.kr-rec{border-color:var(--kin);background:rgba(194,162,90,.1)}
.kr-badge{position:absolute;top:-9px;right:8px;font-size:12px;color:#14110d;background:var(--kin);border-radius:4px;padding:2px 7px}
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
</style>`)}<h3 class="realm-h">家臣</h3>${top}
<div id="kr-cf"></div>
<div class="kr-roster"><p class="kr-note">上限 ${cap}人（今 ${alive.length}人）。役目は何度でも替えられる</p><p class="kr-note">俸禄は毎戦${zeni(wages)}。払えないと忠義が15下がる。${wages > (G.kan || 0) ? '今の銭では俸禄が足りない。' : ''}役目の無い家臣は忠義がさらに5下がる。忠義30未満（野心家は40未満）で戦の後に去る</p>${roster}${history}</div>
</section>`;
}

function rosterRow(G, k) {
  const skills = skillsOf(k);
  const stat = k.s.map((v, i) => `${STAT_LABEL[i]}${v}`).join(' ');
  const rank = G.rank || 0;
  const roles = Object.entries(ROLES).filter(([, def]) => rank >= def.minRank);
  const pills = roles.map(([key, def]) => {
    const on = k.role === key;
    return `<button class="kr-role-btn" type="button" data-kr-role="${key}|${k.id}" aria-pressed="${on}">${esc(def.name)}${on ? '（今）' : ''}</button>`;
  }).join('');
  return `<div class="kr-row"><div class="kr-row-h"><b class="kr-name">${k.gou ? `${esc(k.gou)}・` : ''}${esc(k.name)}${k.named ? '（名のある士）' : ''}</b><span class="kr-loy">忠義 ${k.loy}・${k.loy < (k.tr === '野心家' ? 50 : 40) ? '去る心配あり' : k.loy < 60 ? '不満あり' : '主を頼る'}</span></div>
<p class="kr-stat">${esc(stat)}${k.tr ? `　${esc(k.tr)}` : ''}　${esc(k.from)}</p>
<p class="kr-stat">槍 ${skills.spear}・弓 ${skills.bow}・鉄砲 ${skills.gun}・統率 ${k.s[0]}</p>
<p class="kr-x">${k.battles || 0}戦に出陣・${k.kills || 0}人討ち取り。生きて帰ると使った得物と統率が育つ。手柄が多いほど早く育つ${!k.gou ? '。5人討ち取ると二つ名が付く' : ''}${k.lastGrowth ? `。前の成長：${esc(k.lastGrowth)}` : ''}</p>
<p class="kr-x">${esc(roleEffect(G, k))}</p>
<div class="kr-roles" role="group" aria-label="${esc(k.name)}の得物">${Object.entries(ARMS).map(([arm, def]) => `<button class="kr-role-btn" type="button" data-kr-arm="${arm}|${esc(k.id)}" aria-pressed="${k.arm === arm}">${def.name}で戦う${k.arm === arm ? '（今）' : ''}</button>`).join('')}</div>
<div class="kr-roles">${pills}<button class="kr-role-btn" type="button" data-kr-role="none|${k.id}" aria-pressed="${!k.role}">役目を外す</button></div>
</div>`;
}

function roleEffect(G, k) {
  if (!k.role || !ROLES[k.role] || (G.rank || 0) < ROLES[k.role].minRank) return '次の戦で働く役目を選ぶ';
  if (k.role === 'tegei' && !(G.dom && G.dom.hei > 0)) return '次の戦は手勢がいないため出ない。供に替えると連れて行ける';
  if (k.role === 'kumi') return '次の戦で組があれば副頭になる。組が強くなり、士気も上がる';
  return `次の戦で${ROLES[k.role].note}`;
}

export function keraiBind(G, done, confirm) {
  document.querySelectorAll('[data-kr-arm]').forEach((btn) => {
    btn.onclick = () => {
      const [arm, id] = btn.getAttribute('data-kr-arm').split('|');
      const k = keraiOf(G).find((x) => x.id === id && x.alive);
      if (!k || !ARMS[arm]) return;
      skillsOf(k); k.arm = arm;
      done(`${k.name}は${ARMS[arm].name}で戦う`, 'ui');
    };
  });
  document.querySelectorAll('[data-kr]').forEach((btn) => {
    if (btn.disabled) return;
    const id = btn.getAttribute('data-kr');
    btn.onclick = () => {
      if (G.keraiAt === G.battle) return;
      const c = actionCards(G).find((x) => x.id === id);
      if (!c || (G.kan || 0) < c.cost) return;
      const apply = () => {
        if (G.keraiAt === G.battle || !actionCards(G).some((x) => x.id === id) || (G.kan || 0) < c.cost) return;
        if (c.cost) addKan(G, -c.cost);
        c.apply(G);
        G.keraiAt = G.battle;
        G.keraiMsg = `${c.name}。${c.eff}`;
        done(G.keraiMsg);
      };
      if (c.confirm) confirm(document.getElementById('kr-cf'), `${c.name}。元に戻せません。`, '暇を出す', apply);
      else apply();
    };
  });
  document.querySelectorAll('[data-kr-target]').forEach((select) => {
    select.onchange = () => { actionTargets.set(G, select.value); done('褒美・暇の相手を選んだ', 'ui'); };
  });
  document.querySelectorAll('[data-kr-role]').forEach((btn) => {
    btn.onclick = () => {
      const [role, kid] = btn.getAttribute('data-kr-role').split('|');
      const k = keraiOf(G).find((x) => x.id === kid);
      if (!k || !k.alive) return;
      if (role === 'none') { k.role = null; done(`${k.name}の役目を外した`, 'ui'); return; }
      if (!ROLES[role] || (G.rank || 0) < ROLES[role].minRank) return;
      if (role !== 'tomo') for (const other of keraiOf(G)) if (other.id !== k.id && other.role === role) other.role = null;
      k.role = role;
      done(`${k.name}を${ROLES[role].name}にした`, 'ui');
    };
  });
}

// ---------------- 戦の中 ----------------
function byRole(G, role) {
  return (G.rank || 0) >= (ROLES[role] || {}).minRank ? keraiOf(G).find((k) => k.alive && k.role === role) : undefined;
}
function buffGroup(g, mult) {
  for (const u of g.units) {
    if (!u.alive) continue;
    u.hp = u.maxHp = u.maxHp * mult;
    u.dmg *= mult;
  }
}
function spawnKerai(rt, g, k, o) {
  const skills = skillsOf(k);
  const [u] = rt.army.spawn(g, [{ type: ARMS[k.arm].type, n: 1, o: { name: k.name, flag: null, hat: 'kabuto', ...(o || {}) } }]);
  u.name = k.name; u.kerai = k; u.isSub = true; u.kills = 0;
  u.keraiArm = k.arm;
  u.hp = u.maxHp = 65 * (1 + k.s[1] / 300);
  u.dmg *= 1 + skills[k.arm] / 150;
  u.cdBase *= 1 - skills[k.arm] / 400;
  return u;
}

export function keraiBattle(rt) {
  const G = rt.G;
  if (!(KERAI_CAP[G.rank || 0] || 0) || G.lord || G.practice || rt.def.dojo || rt.def.mapCastle) return;
  rt.realm = rt.realm || {};
  rt.realm.keraiUnits = [];
  // 家臣は三人まで出る。開始時の兵数が多い戦では増やさない。
  let room = Math.max(0, 250 - rt.army.units.filter((u) => u.alive).length);

  const kumi = byRole(G, 'kumi');
  if (room > 0 && kumi && rt.squadGroups && rt.squadGroups.length) {
    const g = rt.squadGroups[0];
    const u = spawnKerai(rt, g, kumi);
    rt.squad.push(u);
    if (g.fuku) g.fuku.fuku = false;
    g.fuku = u; u.fuku = true; room--;
    buffGroup(g, 1 + kumi.s[1] / 400);
    g.morale = Math.min(100, (g.morale ?? 90) + kumi.s[0] / 10);
    rt.realm.keraiUnits.push({ k: kumi, u });
    rt.after(6, () => rt.say(kumi.name, '手前が副頭を務めまする', 3));
    rt.after(8, () => rt.bark(`${kumi.name}が組の副頭に立つ`));
  }

  const tegei = byRole(G, 'tegei');
  if (room > 0 && tegei && rt.realm.tegei && rt.realm.tegei.count > 0) {
    const g = rt.realm.tegei;
    const u = spawnKerai(rt, g, tegei); room--;
    buffGroup(g, 1 + tegei.s[0] / 400);
    g.morale = Math.min(100, (g.morale ?? 80) + 15);
    rt.realm.keraiUnits.push({ k: tegei, u });
    rt.after(8, () => rt.say(tegei.name, '手勢はそれがしが率いる', 3));
    rt.after(10, () => rt.bark(`${tegei.name}が手勢をまとめる`));
  }

  const tomos = keraiOf(G).filter((k) => k.alive && k.role === 'tomo');
  for (const tomo of tomos) {
    if (room <= 0 || rt.realm.keraiUnits.length >= 3) break;
    let g = rt.tomoGroup;
    if (!g) {
      const P = rt.player.u, h = P.heading || 0;
      g = rt.army.addGroup({ team: 0, faction: rt.G.lordFaction || scenario().faction, name: '家臣', order: 'follow', formation: 'line', facing: h,
        anchor: { x: P.pos.x - Math.sin(h) * 2, z: P.pos.z - Math.cos(h) * 2 }, noAI: true, noRout: true, aggro: 7, spacing: 1.4, width: 1, morale: 100 });
    }
    g.kind = 'tomo'; g.isTomo = true; g.fire = true;
    rt.tomoGroup = g;
    g.width = 3;
    const u = spawnKerai(rt, g, tomo); u.isTomo = true; room--;
    rt.realm.keraiUnits.push({ k: tomo, u });
  }
  const waiting = keraiOf(G).filter((k) => k.alive && ['tomo', 'kumi', 'tegei'].includes(k.role) && !rt.realm.keraiUnits.some((x) => x.k === k));
  if (waiting.length) rt.after(11, () => { if (!rt.over) rt.bark(`${waiting.map((k) => k.name).join('・')}は控えに残った（同行は三人まで。兵の数と役目で決まる）`); });
}

// 戦の前の札。討死の記憶は保存された家臣の欄から読む。
export function keraiPrepareHtml(G) {
  const K = keraiOf(G);
  const lost = K.filter((k) => !k.alive && k.left === '討死' && k.deadAt === G.battle - 1);
  const party = K.filter((k) => k.alive && ['tomo', 'kumi', 'tegei'].includes(k.role));
  if (!lost.length && !party.length) return '';
  return `<div role="note" style="font-size:15px;line-height:1.7;margin:16px 0">${lost.length ? `<p>${lost.map((k) => esc(k.name)).join('・')}は、もう戻らない。共に立てた手柄を胸に、次の戦へ。</p>` : ''}${party.length ? `<p>連れて行く家臣：${party.map((k) => { skillsOf(k); return `${esc(k.name)}（${ARMS[k.arm].name}）`; }).join('・')}。同行は三人まで。役目と兵の数で控えに残ることもある。討たれると戻らない。</p>` : ''}</div>`;
}

export function keraiAfter(G, r, b, i) {
  if (!(KERAI_CAP[G.rank || 0] || 0)) return;
  const fought = (b.realm && b.realm.keraiUnits) || [];
  r.realmLines = r.realmLines || [];
  for (const { k, u } of fought) {
    k.kills = (k.kills || 0) + (u.kills || 0);
    if (u.alive) {
      k.battles = (k.battles || 0) + 1;
      r.realmLines.push(`${k.name}、${u.kills || 0}人を討ち取った。無事に帰った（${k.battles}戦目）`);
      growKerai(G, r, k, u);
    } else if (k.alive) {
      leaveKerai(G, k, '討死');
      k.deadAt = i;
      r.realmLines.push(`家臣 ${k.name}、討死（${u.kills || 0}人討ち取り）`);
    }
  }
  const foughtIds = new Set(fought.map((f) => f.k.id));
  for (const k of keraiOf(G).filter((x) => x.alive)) {
    const canPay = (G.kan || 0) >= k.pay;
    if (canPay) addKan(G, -k.pay);
    let delta = canPay ? 3 : -15;
    if (foughtIds.has(k.id)) delta += 2;
    if (!k.role) delta -= 5;
    const before = k.loy;
    k.loy = clamp(k.loy + delta, 0, 100);
    r.realmLines.push(`${k.name}、${canPay ? '俸禄' + zeni(k.pay) + 'を払った' : '俸禄' + zeni(k.pay) + 'が払えない'}。忠義${before}から${k.loy}${!k.role ? '。役目が無く、不満を抱いている' : ''}`);
    const floor = k.tr === '野心家' ? 40 : 30;
    if (k.loy < floor) {
      leaveKerai(G, k, '忠義が下がり出奔');
      r.realmLines.push(`家臣 ${k.name}、忠義が下がり出奔した`);
    }
  }
}

// その役目の生きた家臣で、stat（'lea'・'war'・'int'・'pol'）の値。居なければ 0
export function keraiBest(G, role, stat) {
  const k = byRole(G, role);
  return k ? k.s[STAT_I[stat]] : 0;
}
