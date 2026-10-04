// 戦が終わった時だけ写す。兵や家臣の本体を保存に持ち込まない。
export function recordBattle(G, b, r) {
  if (G.practice || !G.history?.[b.index]) return;
  const h = G.history[b.index];
  h.year = b.tracker.battle.year || '';
  h.won = r.mainDone === true;
  h.busho = [...(b.tracker.busho || [])];
  h.deeds = r.lines.map((l) => ({ label: l.label, detail: l.detail || '', pts: l.pts }));
  const workers = [];
  const seen = new Set();
  const add = (u, person, role) => {
    if (!person || seen.has(person)) return;
    seen.add(person);
    workers.push({ name: person.name, role, kills: u.kills || 0, alive: !!u.alive });
  };
  for (const { k, u } of b.realm?.keraiUnits || []) add(u, k, '家臣');
  for (const u of b.tomoUnits || []) add(u, u.tomo, '供');
  for (const u of b.squad || []) add(u, u.roster, '組の者');
  h.workers = workers;
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// 古い保存は分からない所を「記録なし」として、そのまま読める。
export function battleTimeline(g, battles) {
  const rows = (g.history || []).flatMap((h, i) => {
    if (!h) return [];
    const b = battles.find((x) => x.name === h.battle) || battles[i];
    return [{ h, b, i }];
  });
  rows.sort((a, b) => {
    const year = (row) => Number(String(row.h.year || row.b?.year || '').match(/[0-9]{4}/)?.[0]) || 0;
    return year(a) - year(b) || a.i - b.i;
  });
  if (!rows.length) return '<p class="note">まだ戦の記録がありません。戦を終えると年表に残ります。</p>';
  return `<ol class="kr-timeline" aria-label="戦の年表">${rows.map(({ h, b }) => {
    const won = h.won === true ? '勝ち' : h.won === false ? '負け' : '勝ち負けの記録なし';
    const heads = Array.isArray(h.busho) ? (h.busho.length ? h.busho.map(esc).join('、') : '名のある武将の討ち取りなし') : '記録なし';
    const deeds = Array.isArray(h.deeds) ? `<ul>${h.deeds.map((l) => `<li>${esc(l.label)}${l.detail ? `：${esc(l.detail)}` : ''}（${l.pts > 0 ? '＋' : ''}${esc(l.pts)}）</li>`).join('') || '<li>手柄なし</li>'}</ul>` : '<p>詳しい記録なし</p>';
    const workers = Array.isArray(h.workers) ? `<ul>${h.workers.map((w) => `<li>${esc(w.role)} ${esc(w.name)}：${esc(w.kills)}人を討ち取った・${w.alive ? '無事に帰った' : '討死'}</li>`).join('') || '<li>家臣・供・組の者の出陣なし</li>'}</ul>` : '<p>詳しい記録なし</p>';
    return `<li class="kr-entry"><p class="kr-year">${esc(h.year || b?.year || '年の記録なし')}</p><h4>${esc(h.battle || b?.name || '名のない戦')}　<span>${won}</span></h4><p>戦功 ${esc(h.total ?? 0)}${h.grade ? `・評定 ${esc(h.grade)}` : ''}</p><p><b>討ち取った名</b>：${heads}</p><details><summary>手柄と家臣の働きを見る</summary><h5>手柄</h5>${deeds}<h5>家臣・供・組の者の働き</h5>${workers}</details></li>`;
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
