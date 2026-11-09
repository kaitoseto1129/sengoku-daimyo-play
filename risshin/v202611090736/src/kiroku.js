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
  h.summary = battleSummary(h);
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// 詳しい記録は残し、見せる文だけ三行までにまとめる。古い保存にも同じ上限を使う。
function battleSummary(h) {
  const short = (value, max = 28) => {
    const chars = Array.from(String(value || '').replace(/\s+/g, ' ').trim());
    return chars.length > max ? chars.slice(0, max - 1).join('') + '…' : chars.join('');
  };
  const outcome = h.armyWon === true ? '味方の勝ち。' : h.armyWon === false ? '味方の負け。' : '勝敗の記録なし。';
  const lines = [outcome + (h.won === true ? '任務を果たした。' : h.won === false ? '任務を果たせなかった。' : '')];
  let best = null;
  for (const deed of h.deeds || []) {
    if (deed.pts > 0 && deed.label && (!best || deed.pts > best.pts)) best = deed;
  }
  let work = '';
  if (best) work = `一番の手柄：${short(best.label)}。`;
  else {
    let worker = null;
    for (const w of h.workers || []) {
      if (w.kills > 0 && (!worker || w.kills > worker.kills)) worker = w;
    }
    if (worker) work = `${short(worker.name || '仲間', 16)}が敵を${short(worker.kills, 6)}人討ち取った。`;
    else if (h.tegei?.kills > 0) work = `手勢が敵を${short(h.tegei.kills, 6)}人討ち取った。`;
    else if (h.roleWork?.length) work = `仲間の働き：${short(h.roleWork[0])}。`;
    else if (h.workers?.some((w) => w.stayed)) work = '仲間が留守の役目を果たした。';
  }
  const heads = [...new Set((h.busho || []).filter((name) => String(name || '').trim()))];
  if (work) lines.push(work);
  else if (!heads.length) lines.push('目立つ手柄は無かった。次の戦で名を上げよう。');
  if (heads.length) lines.push(`討ち取った武将：${heads.slice(0, 2).map((name) => short(name, 16)).join('、')}${heads.length > 2 ? `、ほか${heads.length - 2}人` : ''}。`);
  return lines;
}

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
    return `<li class="kr-entry"><p class="kr-year">${esc(h.year || b?.year || '年の記録なし')}</p><h4>${esc(h.battle || b?.name || '名のない戦')}</h4>${battleSummary(h).map((line) => `<p>${esc(line)}</p>`).join('')}</li>`;
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
