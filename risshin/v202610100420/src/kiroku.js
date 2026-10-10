import { RANKS } from './state.js';
// 戦が終わった時だけ写す。兵や家臣の本体を保存に持ち込まない。
export function recordBattle(G, b, r) {
  if (G.practice || !G.history?.[b.index]) return;
  const h = G.history[b.index];
  h.year = b.tracker.battle.year || '';
  h.battleId = b.tracker.battle.id;
  h.won = r.mainDone === true;
  h.armyWon = b.withdrawal ? b.withdrawal.losing === 1 : typeof b.result?.armyWon === 'boolean' ? b.result.armyWon : null;
  h.armyRetreated = b.withdrawal ? b.withdrawal.losing === 0 : null;
  h.rankAfter = r.rankAfter ?? G.rank;
  h.promoted = r.promoted === true;
  h.roleWork = (r.realmLines || []).filter((l) => /副頭|留守居|使者|調略|内通|援軍|控え|手勢の頭/.test(l));
  const last = [...(b.objectives || [])].filter((o) => o.kind !== 'side').sort((a, c) => (c.t || 0) - (a.t || 0))[0];
  h.lastMission = last ? { text: last.text, progress: last.progress || '', state: last.state || '未達' } : null;
  h.endReason = b.result?.dead ? '討死' : b.result?.down ? '重傷で退いた' : r.mainDone ? '任務達成' : b.withdrawal ? '退却・任務未達' : '任務未達';
  h.busho = [...(b.tracker.busho || [])];
  h.deeds = (r.lines || []).map((l) => ({ label: l.label === '副任務達成' && l.detail ? l.detail : l.label, detail: l.label === '副任務達成' ? '' : l.detail || '', pts: l.pts }));
  const workers = [];
  const seen = new Set(), seenUnits = new Set();
  const add = (u, person, role) => {
    if (!u || !person || seen.has(person) || seenUnits.has(u)) return;
    seen.add(person); seenUnits.add(u);
    workers.push({ name: person.name || '名の記録なし', role, kills: u.kills || 0, alive: typeof u.alive === 'boolean' ? u.alive : null });
  };
  for (const { k, u, role: assignedRole } of b.realm?.keraiUnits || []) {
    const role = { kumi: '組の副頭（組の強さと士気を支える）', tegei: '手勢の頭（手勢の強さと士気を支える）', tomo: '供（主のそばで戦う）' }[assignedRole || k.role] || '家臣';
    add(u, k, role);
  }
  for (const u of b.tomoUnits || []) add(u, u.tomo, '供');
  for (const u of b.squad || []) add(u, u.roster, '組の者');
  for (const support of b.realm?.keraiSupport || []) workers.push({ name: support.name, role: support.role === 'rusu' ? '留守居（年貢を支える）' : '使者（調略の見込みを支える）', kills: null, alive: null, stayed: true });
  h.workers = workers;
  const tegei = (b.realm?.tegei?.units || []).filter((u) => u.isHei && !seenUnits.has(u));
  const survived = (u) => u.alive || (b.withdrawal && u.gone && u.fleeing && u.hp > 0);
  h.tegei = tegei.length ? { sent: tegei.length, returned: tegei.filter(survived).length, kills: tegei.reduce((n, u) => n + (u.kills || 0), 0) } : null;
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// 古い保存は分からない所を「記録なし」として、そのまま読める。
export function battleTimeline(g, battles) {
  const rows = (g.history || []).flatMap((h, i) => {
    if (!h) return [];
    const b = battles.find((x) => h.battleId && x.id === h.battleId) || battles.find((x) => x.name === h.battle) || (!h.battle && !h.battleId ? battles[i] : null);
    return [{ h, b, i }];
  });
  rows.sort((a, b) => {
    const year = (row) => Number(String(row.h.year || row.b?.year || '').match(/[0-9]{4}/)?.[0]) || 0;
    const ya = year(a), yb = year(b);
    return (ya && yb ? ya - yb : ya ? -1 : yb ? 1 : 0) || a.i - b.i;
  });
  if (!rows.length) return '<p class="note">まだ戦の記録がありません。戦を終えると年表に残ります。</p>';
  return `<ol class="kr-timeline" aria-label="戦の年表">${rows.map(({ h, b }) => {
    const won = h.won === true ? '任務達成' : h.won === false ? '任務失敗' : '任務の成否の記録なし';
    const army = h.armyWon === true ? '味方の勝ち' : h.armyWon === false ? '味方の負け' : '勝敗の記録なし';
    const roleWork = Array.isArray(h.roleWork) ? `<h5>役目の働き</h5><ul>${h.roleWork.map((l) => `<li>${esc(l)}</li>`).join('') || '<li>目立った働きの記録なし</li>'}</ul>` : '<p>役目の働きの記録なし</p>';
    const heads = Array.isArray(h.busho) ? (h.busho.length ? h.busho.map(esc).join('、') : '名のある武将の討ち取りなし') : '記録なし';
    const deeds = Array.isArray(h.deeds) ? `<ul>${h.deeds.map((l) => `<li>${esc(l.label || '名の記録なし')}${l.detail ? `：${esc(l.detail)}` : ''}（${l.pts > 0 ? '＋' : ''}${esc(l.pts ?? '点の記録なし')}）</li>`).join('') || '<li>手柄なし</li>'}</ul>` : '<p>詳しい記録なし</p>';
    const workers = Array.isArray(h.workers) ? `<ul>${h.workers.map((w) => `<li>${esc(w.role || '役目の記録なし')} ${esc(w.name || '名の記録なし')}：${w.stayed ? '戦場に出ず役目を務めた' : w.kills == null ? '討ち取り数の記録なし' : `${esc(w.kills)}人を討ち取った`}・${w.stayed ? '留守の働き' : w.alive === true ? '無事に帰った' : w.alive === false ? '討死' : '生死の記録なし'}</li>`).join('') || '<li>家臣・供・組の者の出陣なし</li>'}</ul>` : '<p>詳しい記録なし</p>';
    return `<li class="kr-entry"><p class="kr-year">${esc(h.year || b?.year || '年の記録なし')}</p><h4>${esc(h.battle || b?.name || '名のない戦')}　<span>${won}</span></h4><p>軍の勝敗：${army}${h.armyRetreated === true ? '・味方が退却' : ''}</p><p>戦功 ${esc(h.total ?? '記録なし')}${h.grade ? `・評定 ${esc(h.grade)}` : ''}・戦後の身分 ${esc(RANKS[h.rankAfter]?.name || '記録なし')}${h.promoted === true ? '（取り立てられた）' : h.promoted === false ? '（取り立てなし）' : ''}</p>${h.endReason ? `<p>戦の終わり：${esc(h.endReason)}${h.lastMission ? `。最後の任務：${esc(h.lastMission.text)}${h.lastMission.progress ? `（${esc(h.lastMission.progress)}）` : ''}` : ''}</p>` : ''}<p><b>討ち取った名</b>：${heads}</p><details><summary>手柄と家臣の働きを見る</summary><h5>手柄</h5>${deeds}<h5>家臣・供・組の者の働き</h5>${workers}${roleWork}${h.tegei ? `<p>手勢：${esc(h.tegei.sent)}人が出陣・${esc(h.tegei.returned)}人が帰還・敵${esc(h.tegei.kills)}人を討ち取った</p>` : ''}</details></li>`;
  }).join('')}</ol>`;
}

export const TIMELINE_STYLE = `
.kr-timeline { list-style: none; margin: 24px 0; padding: 0 0 0 16px; border-left: 2px solid var(--kin); }
.kr-entry { margin: 0 0 24px; padding: 16px; border: 1px solid var(--line); overflow-wrap: anywhere; font-size: 16px; line-height: 1.7; }
.kr-entry p { margin: 0 0 8px; } .kr-entry .kr-year { color: var(--washi-dim); font-size: 13px; }
.kr-entry h4 { font-family: var(--display); font-size: 20px; margin: 0 0 8px; } .kr-entry h4 span { color: var(--kin); }
.kr-entry h5 { font-size: 16px; margin: 24px 0 8px; } .kr-entry ul { padding-left: 24px; }
.kr-entry summary { min-height: 44px; box-sizing: border-box; padding: 8px; border: 1px solid var(--line); cursor: pointer; }
.kr-entry summary:focus-visible { outline: 3px solid var(--kin); outline-offset: 2px; box-shadow: 0 0 0 6px #14120f; }
`;
