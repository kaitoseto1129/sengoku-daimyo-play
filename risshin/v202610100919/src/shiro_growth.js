// 自分の城の普請。今ある G.japan.dom と家の金で保存する。
// 累計の勲功は出世にも使うため減らさず、普請に使った分を別に覚える。
export const SHIRO_PARTS = [
  { id: 'moat', name: '堀', gold: 300, merit: 40, hard: 6 },
  { id: 'stone', name: '石垣', gold: 500, merit: 60, hard: 8 },
  { id: 'tower', name: '櫓', gold: 400, merit: 50, hard: 6 },
  { id: 'gate', name: '門', gold: 250, merit: 30, hard: 5 },
  { id: 'store', name: '兵糧蔵', gold: 300, merit: 40, hard: 5 },
];
export function shiroParts(J, id) { return J?.dom?.[id]?.shiro || {}; }
export function shiroHard(J, id) {
  const parts = shiroParts(J, id);
  return SHIRO_PARTS.reduce((n, p) => n + (parts[p.id] ? p.hard : 0), 0);
}
export function myShiro(J) {
  const id = J?.post;
  return id != null && J.mibun >= 4 && J.me && J.lord?.[id] === J.me && J.own?.[id] === J.gen?.[J.me]?.c ? id : null;
}
export function shiroReason(D, J, id, part) {
  if (!part || J.mibun < 4 || !J.me || J.own[id] !== D.player || J.lord[id] !== J.me || !J.dom[id]) return '自分が城主になった城で築けます';
  if (shiroParts(J, id)[part.id]) return '築いた';
  const gold = J.bank[D.player]?.g || 0, merit = Math.max(0, (J.kou || 0) - (J.shiroSpent || 0));
  const need = [];
  if (gold < part.gold) need.push(`金があと${part.gold - gold}貫`);
  if (merit < part.merit) need.push(`手柄があと${part.merit - merit}`);
  return need.join('・');
}
export function buildShiro(D, J, id, key) {
  const part = SHIRO_PARTS.find((p) => p.id === key);
  if (shiroReason(D, J, id, part)) return false;
  const d = J.dom[id];
  d.shiro = d.shiro || {};
  d.shiro[key] = true;
  J.bank[D.player].g -= part.gold;
  J.shiroSpent = (J.shiroSpent || 0) + part.merit;
  J.log.push({ t: J.turn, s: `${D.byId[id].name}に${part.name}を築いた。堅さが${part.hard}増した`, k: 'good' });
  return true;
}
export function shiroHtml(D, J, id) {
  if (J.mibun < 4 || J.own[id] !== D.player || J.lord[id] !== J.me) return '';
  return `<section style="font-size:15px;line-height:1.6;color:var(--washi)"><h3>自分の城を育てる</h3><p>使える手柄 ${Math.max(0, (J.kou || 0) - (J.shiroSpent || 0))}・家の金 ${Math.floor(J.bank[D.player]?.g || 0)}貫<br>城下で自分の城の姿が変わります。次の籠城では門が固くなります。遊びの普請で、史実の復元ではありません。</p><div style="display:grid;gap:8px">${SHIRO_PARTS.map((p) => {
    const why = shiroReason(D, J, id, p);
    return `<div><button class="btn small" data-shiro="${p.id}" style="min-height:44px;width:100%;font-size:15px" ${why ? 'disabled' : ''}>${p.name}を築く・堅さ ＋${p.hard}</button><p style="margin:4px 0 0;font-size:13px">金${p.gold}貫・手柄${p.merit}${why ? ` ／ ${why}` : ''}</p><div data-shiro-confirm="${p.id}"></div></div>`;
  }).join('')}</div><p>使った手柄は出世の累計からは減りません。</p></section>`;
}
