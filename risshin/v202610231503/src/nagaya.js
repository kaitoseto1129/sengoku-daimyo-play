// 長屋の仲間は供ではなく組の名簿の兵。加入済みの名を残し、討死後も同じ者を補充しない。
import { shitaKind } from './kumi.js';
import { scenarioKey } from './state.js';
export const nagayaOn = (G) => !!G && !G.lord && !G.practice && !G.trialStep && scenarioKey() === 'oda';
const CAST = [
  { name: '久助', face: 2, word: '源八殿に教わった槍を、今度はおぬしの隣で振るう' },
  { name: '茂吉', face: 4, word: '太郎丸のように、仲間の背を守りたい' },
  { name: '庄作', face: 7, word: '国の者を守るため、わしも組に加わろう' },
  { name: '弥六', face: 0, word: '先に戦った者の働きを、わしらが継いでゆく' },
  { name: '清吉', face: 9, word: '今度こそ、組の皆と生きて帰りたい' },
];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function nagayaOf(G) {
  const N = G.nagaya ||= { joined: [], dead: [], at: -1 };
  N.joined ||= []; N.dead ||= [];
  return N;
}
export function nagayaMembers(G) { return (G.roster || []).filter((r) => r.nagaya && r.alive); }
function next(G) {
  const N = nagayaOf(G);
  if (N.at === G.battle || nagayaMembers(G).length >= 3) return null;
  return CAST.find((c) => !N.joined.includes(c.name) && !(G.fallen || []).includes(c.name));
}
export function nagayaHtml(G) {
  if (!nagayaOn(G)) return '';
  const N = nagayaOf(G), c = next(G), members = nagayaMembers(G);
  return `<section class="ng"><style>
.ng{color:var(--washi);font-size:15px;line-height:1.5}.ng h3{color:var(--kin);margin:0 0 8px}.ng p{margin:8px 0}.ng .btn{min-height:44px;margin:0}.ng .ng-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:8px;border:1px solid var(--line);margin-bottom:8px}.ng .ng-face svg{width:100%;height:100%}.ng .ng-face{width:44px;height:44px;flex:none}
</style><h3>足軽の長屋</h3><p>源八・太郎丸に続く仲間。次の戦で自分の組に入る。討たれた者は戻らない。</p>
${members.map((r) => `<div class="ng-row"><span class="ng-face" role="img" aria-label="${esc(r.name)}の顔">${face(r.face)}</span><b>${esc(r.name)}</b><span>${r.battles || 0}戦を生き抜いた・次の戦も共に立つ</span></div>`).join('')}
${c ? `<div class="ng-row"><span class="ng-face" role="img" aria-label="${c.name}の顔">${face(c.face)}</span><div><b>${c.name}</b><p>「${c.word}」</p></div><button class="btn" data-ng-join="${c.name}">${c.name}を組に迎える</button></div>` : '<p>今は新たな仲間を迎えられない。次の戦から戻れば、一人ずつ迎えられる（共に出るのは三人まで）。</p>'}
${N.dead.length ? `<p>戻らぬ仲間：${N.dead.map(esc).join('・')}。共に立てた手柄を忘れない。</p>` : ''}<p>${G.rank >= 2 ? '出陣の支度で、配下三人までの槍・鉄砲・弓と、組の並べ方を決められる。' : '足軽組頭になれば、出陣の支度で配下の武器と並べ方を決められる。'}</p></section>`;
}
// 顔は素材を増やさず、漫画の配役の顔番号から描く小さな絵。
function face(n = 0) {
  return `<svg viewBox="0 0 44 44" aria-hidden="true"><path fill="#63503b" d="M4 44V35Q22 24 40 35V44"/><ellipse cx="22" cy="21" rx="${10 + n % 3}" ry="15" fill="#d8b68a"/><path fill="#30271f" d="M10 16V8Q22 0 34 8V16L28 10H16Z"/><path d="M15 20h3m8 0h3M19 29h6" stroke="#30271f" stroke-width="2"/>${n % 2 ? '<path d="M15 31Q22 39 29 31" stroke="#514032" fill="none"/>' : ''}</svg>`;
}
export function nagayaBind(G, done) {
  document.querySelectorAll('[data-ng-join]').forEach((b) => { b.onclick = () => {
    const c = next(G); if (!c || c.name !== b.dataset.ngJoin) return;
    const N = nagayaOf(G);
    N.joined.push(c.name); N.at = G.battle;
    (G.roster ||= []).push({ id: `nagaya-${c.name}`, name: c.name, face: c.face, kind: 'spear', battles: 0, kills: 0, alive: true, nagaya: true, loyal: 80, wound: 0 });
    done(`${c.name}を迎えた。次の戦で同じ組に入る`);
  }; });
}
export function nagayaBattle(rt) {
  if (!nagayaOn(rt.G) || rt.def.town || rt.def.dojo || rt.def.mapCastle) return;
  const missing = nagayaMembers(rt.G).filter((r) => !rt.squad.some((u) => u.roster?.id === r.id));
  // 組を持たない足軽でも隣に立つ。既に組にいる仲間を二重に作らない。
  if (missing.length) {
    const list = ['spear', 'gun', 'bow'].map((kind) => { const members = missing.filter((r) => shitaKind(rt.G, r) === kind); return { kind, n: members.length, members }; }).filter((q) => q.n);
    rt.makeSquad({ x: rt.player.u.pos.x + 2, z: rt.player.u.pos.z - 3 }, rt.player.yaw, list);
  }
  const first = rt.squad.find((u) => u.roster?.nagaya);
  if (first) rt.after(4, () => { if (!rt.over && first.alive) rt.say(first.name, 'ここにおる。互いの背を守ろう', 3); });
}
export function nagayaAfter(G, r, rt) {
  const N = nagayaOf(G);
  for (const u of rt.squad || []) if (u.roster?.nagaya && !u.alive && !(rt.withdrawal && u.gone && u.fleeing && u.hp > 0)) {
    u.roster.alive = false;
    if (!N.dead.includes(u.name)) { N.dead.push(u.name); r.realmLines.push(`${u.name}が討死した。もう長屋には戻らない`); }
  }
}
