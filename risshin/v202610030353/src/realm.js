// 段2「出世と国づくり」の入口：城下の札「知行」と、戦の始め・終わりの効き目を三つの柱に配る。
// このファイルは係A（内政と知行）だけが直す。中身は domain.js（A）・retainers.js（B）・diplomacy.js（C）に持たせる。
import { scenarioKey, RANKS, BATTLES } from './state.js';
import * as DM from './domain.js';
import * as RT from './retainers.js';
import * as DP from './diplomacy.js';

export const REALM_ICON = '<svg viewBox="0 0 24 24"><path d="M4 20 V10 L12 4 L20 10 V20 Z"/><path d="M9 20 V13 H15 V20"/><path d="M6 20 H18"/></svg>';

const on = (G) => G && !G.lord && !G.practice && scenarioKey() === 'oda';

const safe = (f) => { try { f(); } catch (e) { console.error('realm', e); } };

// battle.js が makeTomo の後に呼ぶ
export function realmBattle(rt) {
  if (!on(rt.G) || rt.def.dojo || rt.def.mapCastle) return;
  rt.realm = {};
  const nx = DP.dipOf(rt.G).next;
  rt.realm.dip = nx && nx.battle === rt.index ? nx : null;
  safe(() => DM.domainBattle(rt));
  safe(() => RT.keraiBattle(rt));
  safe(() => DP.diploBattle(rt));
  safe(() => realmShow(rt));
}

// 城下で選んだ事が、この戦のどこに出たかを札と台詞で見せる
function realmShow(rt) {
  const R = rt.realm, parts = [];
  if (R.heiN) parts.push(`手勢${R.heiN}人`);
  if (R.tsukuroi) parts.push('繕った具足');
  if (R.hyourou) parts.push('蓄えた兵糧');
  const ks = R.keraiUnits || [];
  for (const { k } of ks.slice(0, 2)) parts.push(`家臣 ${k.name}`);
  if (R.dip) parts.push(R.dip.kind === 'turn' ? '内通の使者' : R.dip.kind === 'aid' ? '援軍の約束' : '使者の供');
  if (!parts.length) return;
  rt.after(2.5, () => { if (!rt.over) rt.obj('realm', `城下の備え：${parts.join('・')}`, 'side'); });
  rt.after(50, () => rt.objRemove('realm'));
  const tomo = ks.find((x) => x.k.role === 'tomo');
  if (tomo) rt.after(5, () => { if (!rt.over && tomo.u.alive) rt.say(tomo.k.name, '殿のおそば、離れませぬ', 3); });
  const first = ks[0];
  if (first) {
    rt.after(40, () => {
      if (rt.over || !first.u.alive) return;
      const w = first.u.kills ? `${first.u.kills}人討ち取った。まだまだ` : '手前もここに。殿、ご無事で';
      rt.say(first.k.name, w, 3);
    });
  }
  if (R.dip && R.dip.kind === 'turn') rt.after(12, () => { if (!rt.over) rt.say('使者', '内通の返事は、戦の半ばで分かりまする', 3); });
}

// 知行の支度（城下で今なにをすればよいか）。k：内政 dom・家臣 kerai・外交 dip
export function realmTodo(G) {
  if (!on(G)) return [];
  const rank = G.rank || 0;
  const L = [];
  const D = DM.domOf(G);
  L.push({ k: 'dom', n: '内政', done: D.at === G.battle, can: DM.domainCards(G).length > 0 });
  if (RT.KERAI_CAP[rank]) {
    const alive = RT.keraiOf(G).filter((k) => k.alive);
    const noRole = alive.find((k) => !k.role);
    const acts = RT.actionCards(G).length > 0;
    L.push({ k: 'kerai', n: '家臣', done: G.keraiAt === G.battle || (!acts && alive.length > 0), can: acts || !!noRole,
      hint: noRole ? `${noRole.name}の役目を決める` : alive.length ? '' : '召し抱える' });
    if (noRole && L[1].done) L[1].done = false;
  } else L.push({ k: 'kerai', n: '家臣', lock: `${RANKS[1].name}から` });
  const P = DP.dipOf(G);
  const dc = DP.diploCards(G);
  L.push({ k: 'dip', n: '外交', done: P.at === G.battle, can: dc.length > 0, lock: P.at !== G.battle && !dc.length ? (rank <= 1 ? '今は使者の用が無い' : '今できる事は無い') : '' });
  for (const t of L) if (!t.done && !t.lock && !t.can) t.lock = '今できる事は無い';
  return L;
}
export function realmLeft(G) { return realmTodo(G).filter((t) => !t.done && !t.lock); }

// 次の戦に出る物（城下の選びの効き目）
export function realmPreview(G) {
  if (!on(G)) return [];
  const L = [];
  const sq = (RANKS[G.rank || 0] || {}).squad || 0;
  if (sq) L.push(`預かる組 ${sq}人`);
  const D = DM.domOf(G);
  if (D.hei) L.push(`手勢 ${D.hei}人${D.machi >= 2 ? '（四人に一人は鉄砲）' : ''}${D.ren ? `・鍛え ${D.ren}段` : ''}`);
  if (D.tsukuroi) L.push('繕った具足（体力が増える）');
  if (D.hyourou) L.push('蓄えた兵糧（気力が落ちにくい）');
  for (const k of RT.keraiOf(G)) if (k.alive && k.role) L.push(`${k.name}：${(RT.ROLES[k.role] || {}).name || ''}`);
  const nx = DP.dipOf(G).next;
  if (nx && nx.battle === G.battle) {
    const bi = BATTLES[G.battle];
    L.push(nx.kind === 'turn' ? `${(bi && DP.TURN_OF[bi.id]) || '敵の国衆'}へ内通の使者（通れば戦の半ばで退く）` : nx.kind === 'aid' ? `${DP.houseName(nx.house)}の援軍が来る` : `${DP.houseName(nx.house)}への使者の供`);
  }
  return L;
}

// 城下の入口（上官の札）に出す、知行の支度の一覧
export function realmBossHtml(G) {
  const T = realmTodo(G);
  if (!T.length) return '';
  const left = T.filter((t) => !t.done && !t.lock);
  const pv = realmPreview(G);
  const row = (t) => `<li class="${t.done ? 'ok' : t.lock ? 'lk' : 'td'}"><em>${t.done ? '済' : t.lock ? '－' : 'まだ'}</em><b>${t.n}</b>${t.lock ? `<span>${t.lock}</span>` : t.hint && !t.done ? `<span>${t.hint}</span>` : ''}</li>`;
  return `<div class="rb" role="group" aria-label="知行の支度"><style>
.rb{margin:12px 0;padding:10px 12px;border:1px solid rgba(194,162,90,.45);border-radius:8px;background:rgba(194,162,90,.07)}
.rb small{display:block;font-size:12px;color:var(--kin);letter-spacing:.15em;margin-bottom:6px}
.rb ul{list-style:none;margin:0 0 8px;padding:0;display:flex;flex-wrap:wrap;gap:6px 14px}
.rb li{font-size:14px;color:var(--washi-dim)}
.rb li em{font-style:normal;font-size:12px;border:1px solid currentColor;border-radius:4px;padding:0 4px;margin-right:4px}
.rb li.td{color:var(--washi)} .rb li.td em{color:var(--kin)} .rb li.ok em{color:#9cc28a} .rb li.lk{color:var(--washi-faint)}
.rb li span{margin-left:4px;font-size:13px}
.rb .rb-one{font-size:16px;color:var(--washi);margin:0 0 6px}.rb .rb-one b{color:var(--kin)}
.rb p{font-size:13px;color:var(--washi-dim);margin:0 0 8px}
.rb .btn{min-height:44px}
</style><small>知行の支度（次の戦に出る）</small><p class="rb-one">${left.length ? `<b>いまの一手：${left[0].n}</b>${left[0].hint ? `　${left[0].hint}` : ''}` : '<b>支度は済んだ。出陣できる</b>'}</p><ul>${T.map(row).join('')}</ul>${pv.length ? `<p>次の戦：${pv.join('・')}</p>` : ''}${left.length ? `<button class="btn small" data-tab="realm">屋敷で${left[0].n}を選ぶ</button>` : ''}</div>`;
}

// main.js が settle の直後に呼ぶ
export function realmAfter(G, r, b, i) {
  if (!on(G)) return;
  r.realmLines = [];
  safe(() => DM.domainAfter(G, r, b, i));
  safe(() => RT.keraiAfter(G, r, b, i));
  safe(() => DP.diploAfter(G, r, b, i));
  G.realmLog = { at: G.battle, lines: r.realmLines.slice(0, 6) };
  safe(() => recordDeeds(G, r, i));
}

// 武功帳：手柄になった一行だけを、戦ごとに残す（多くても二十戦分）。城下の知行の札で読み返せる
const DEED_RE = /討ち取った|寝返|加わらな|討死|出奔|加増|賜った|知行が|二つ名|援軍が加勢|仲が深まった|弱み/;
function recordDeeds(G, r, i) {
  const L = (r.realmLines || []).filter((l) => DEED_RE.test(l)).slice(0, 3);
  if (r.promoted && RANKS[r.rankAfter]) L.unshift(`${RANKS[r.rankAfter].name}に取り立てられた`);
  if (!L.length) return;
  const bi = BATTLES[i];
  const list = G.deeds || (G.deeds = []);
  list.push({ n: (bi && bi.name) || '戦', lines: L.slice(0, 3) });
  while (list.length > 20) list.shift();
}
// 出世で開く事（次の身分になると、何ができるか）
const UNLOCK = ['郎党を一人召し抱えられる', '知行30石を賜り、田を開く・兵を集める・使者を務める事ができる', '知行60石になり、町を開く・手勢を鍛える・贈り物を届ける事ができる', '知行100石になり、同盟の話・婚姻の仲立ちができる'];
function upHint(G) {
  const nx = RANKS[(G.rank || 0) + 1];
  if (!nx || !UNLOCK[G.rank || 0]) return '';
  return `<p class="realm-up">次の身分「${nx.name}」になると：${UNLOCK[G.rank || 0]}</p>`;
}
function deedsHtml(G) {
  const d = (G.deeds || []).slice(-4).reverse();
  if (!d.length) return '';
  return `<details class="realm-deeds"><summary>武功帳（これまでの手柄）</summary><ul>${d.map((x) => `<li><b>${x.n}</b>　${x.lines.join('・')}</li>`).join('')}</ul></details>`;
}

// screens.js の城下「知行」札
export function realmHtml(G) {
  const log = (G.realmLog && G.realmLog.lines) || [];
  const top = log.length ? `<div class="realm-log"><p class="note">前の戦の後</p><ul>${log.slice(0, 3).map((l) => `<li>${l}</li>`).join('')}</ul></div>` : '';
  const T = realmTodo(G), left = T.filter((t) => !t.done && !t.lock), pv = realmPreview(G);
  const guide = `<div class="realm-go" role="note"><b>${left.length ? `あと${left.map((t) => t.n).join('・')}を一つずつ選ぶ` : '支度は済んだ。上官の所から出陣できる'}</b><span>選んだ事は次の戦に出る。一つの戦の前に、それぞれ一度だけ。</span>${pv.length ? `<span>次の戦：${pv.join('・')}</span>` : ''}</div>`;
  return `<div class="realm"><style>
.realm-go{margin-bottom:10px;padding:8px 10px;border-left:3px solid var(--kin);background:rgba(194,162,90,.08)}
.realm-go b{display:block;font-size:15px;color:var(--washi)}
.realm-go span{display:block;font-size:13px;color:var(--washi-dim);margin-top:2px}
.realm-log{margin-bottom:10px}
.realm-log ul{margin:4px 0 0;padding-left:18px;font-size:13px;color:var(--washi-dim)}
.realm-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:10px}
.realm-h{font-size:14px;color:var(--kin);margin:0 0 6px}
.realm-up{margin:0 0 10px;font-size:13px;color:var(--washi-dim)}
.realm-deeds{margin:10px 0 0;font-size:13px;color:var(--washi-dim)}
.realm-deeds summary{min-height:44px;display:flex;align-items:center;cursor:pointer;color:var(--kin)}
.realm-deeds ul{margin:0;padding-left:18px}.realm-deeds li{margin-bottom:4px}
</style>${guide}${top}${upHint(G)}<div class="realm-grid">${DM.domainHtml(G)}${RT.keraiHtml(G)}${DP.diploHtml(G)}</div>${deedsHtml(G)}</div>`;
}

export function realmBind(G, done, confirm) {
  DM.domainBind(G, done, confirm);
  RT.keraiBind(G, done, confirm);
  DP.diploBind(G, done, confirm);
}
