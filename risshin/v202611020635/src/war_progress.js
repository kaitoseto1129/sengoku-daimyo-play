// 章の進みと「合戦の進行」（kaito 11/1 昼の手本・docs/kaito_play_1101.md の J・K）。
// 章の並び（CHAPTERS）・戦の中の目標の並び（stages.js の段）・止めた時の「合戦の進行」の札の中身を一か所に置く。
// 目標の中身と進みの判定は stages.js（B の係と同じ物を読む）。ここは見せ方だけ。
import { ODA_LINE, lineOf } from './state.js';
import { STAGES, stageNow } from './stages.js';

// 織田家編の章。戦の並び（ODA_LINE）の id で引く。
export const CHAPTERS = [
  { name: '尾張統一と美濃攻め', ids: ['inou', 'okehazama', 'moribe', 'sunomata', 'inabayama'] },
  { name: '上洛と包囲網', ids: ['mitsukuri', 'okawachi', 'kanegasaki', 'anegawa', 'nodafukushima', 'shiga', 'hieizan'] },
  { name: '武田と浅井・朝倉', ids: ['mikatagahara', 'tonezaka', 'odani', 'nagashima', 'shitaragahara'] },
  { name: '一向一揆と本願寺', ids: ['echizen', 'echizen_ikko', 'iwamura', 'tennoji', 'saika', 'tedorigawa', 'shigisan', 'kizugawa'] },
  { name: '天下布武の果て', ids: ['miki', 'arioka', 'iga', 'tottori', 'takato', 'tano', 'honnoji'] },
];

// 戦の筋の短い説明（二〜三行）。無い戦は年と場所から作る。
const STORY = {
  inou: '信長の弟・信勝を主に立てようと、柴田勝家と林美作守が兵を挙げた。信長の七百が、倍を超える敵と稲生の野で向き合う。',
  okehazama: '今川義元の大軍が尾張へ攻め込んだ。雨に紛れて桶狭間の本陣へ迫り、義元の首を狙う。',
  moribe: '斎藤義龍が死に、美濃が揺れている。雨の川を渡り、森部で斎藤勢の大将たちを討つ。',
  sunomata: '美濃攻めの足がかりに、敵の目の前の墨俣へ砦を築く。寄せてくる斎藤勢から柵を守り抜く。',
  inabayama: '斎藤龍興の稲葉山城を攻める。城下に火を放ち、山道から城へ迫る。',
};

const thumb = (id) => new URL(`../assets/thumbs/${id}.webp`, import.meta.url).href;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function chapterOf(key) {
  const k = CHAPTERS.findIndex((c) => c.ids.includes(key));
  return k < 0 ? null : { k, ...CHAPTERS[k] };
}

// 章の戦の並びと、それぞれの状態（done／now／open／lock）
export function chapterRows(rt) {
  const ch = chapterOf(rt?.def?.key);
  if (!ch) return null;
  const G = rt.G || {};
  const line = lineOf(G), prog = G.battle | 0;
  const rows = ch.ids.map((id) => {
    const b = ODA_LINE.find((x) => x.id === id) || { id, name: id };
    const j = line.findIndex((x) => x.id === id);
    const state = id === rt.def.key ? 'now' : j < 0 || j < prog || (G.grades || [])[j] ? 'done' : j === prog || j < 3 ? 'open' : 'lock';
    return { id, name: b.name, short: b.name.replace(/の戦い$|の戦$|の決戦$/, '').replace(/[・（].*$/, ''), state };
  });
  return { ...ch, rows };
}

// 段の並び：済んだ物・今の物・まだ先の物。段の無い戦は null
export function stageRows(rt) {
  const list = rt?.def && STAGES[rt.def.key];
  const now = stageNow(rt);
  if (!list || !now) return null;
  const done = rt.over && rt.tracker?.main === true;
  return {
    i: now.i, n: now.n,
    rows: list.map((s, k) => ({ text: s[0], state: done || k < now.i ? 'done' : k === now.i ? 'now' : 'lock' })),
  };
}

// 進行率（0〜1）。段の数と、今の段の中の進み（def.missionPercent があれば）から。
export function stagePercent(rt, st) {
  if (!st) return 0;
  if (rt.over && rt.tracker?.main === true) return 1;
  let inner = 0;
  try { inner = Math.max(0, Math.min(0.95, Number(rt.def.missionPercent?.(rt)) || 0)); } catch (e) { inner = 0; }
  return Math.max(0, Math.min(1, (st.i + inner) / st.n));
}

export const SVG = {
  check: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5l3.2 3.2L13 4.6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  dot: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="8" cy="8" r="3.4" fill="currentColor"/></svg>',
  lock: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 7V5.2a3 3 0 0 1 6 0V7" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="3.4" y="7" width="9.2" height="7" rx="1.2" fill="currentColor"/></svg>',
  mon: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10.5" fill="none" stroke="currentColor" stroke-width="1.4"/><g fill="currentColor"><ellipse cx="12" cy="6.6" rx="2.6" ry="3.2"/><ellipse cx="17.2" cy="10.4" rx="2.6" ry="3.2" transform="rotate(72 17.2 10.4)"/><ellipse cx="15.2" cy="16.6" rx="2.6" ry="3.2" transform="rotate(144 15.2 16.6)"/><ellipse cx="8.8" cy="16.6" rx="2.6" ry="3.2" transform="rotate(216 8.8 16.6)"/><ellipse cx="6.8" cy="10.4" rx="2.6" ry="3.2" transform="rotate(288 6.8 10.4)"/><circle cx="12" cy="12" r="2"/></g></svg>',
};

const STATE_WORD = { done: '完了', now: '進行中', open: 'これから', lock: '未解放' };
const GOAL_WORD = { done: '完了', now: '進行中', lock: '未達' };

// 止めた時の「合戦の進行」の札（screens.js の pauseMenu の頭へ入れる）
export function warProgressHtml(rt) {
  if (!rt || rt.def?.town || rt.def?.dojo) return '';
  const ch = chapterRows(rt), st = stageRows(rt);
  if (!ch && !st) return '';
  const b = ODA_LINE.find((x) => x.id === rt.def.key);
  const name = b?.name || rt.def.title || '';
  const story = STORY[rt.def.key] || (b ? `${b.year}、${b.place}。` : '');
  const left = ch ? `<ol class="wp-list" aria-label="${esc(ch.name)}の戦">${ch.rows.map((r) => `<li class="wp-b ${r.state}"><span class="wp-th" style="background-image:url('${thumb(r.id)}')">${r.state === 'lock' ? SVG.lock : ''}</span><span class="wp-bn">${esc(r.name)}</span><em>${STATE_WORD[r.state]}</em></li>`).join('')}</ol>` : '';
  let right = `<div class="wp-cur"><div class="wp-eye">現在の任務</div><div class="wp-path">${ch ? `${esc(ch.name)}<span aria-hidden="true">›</span>` : ''}<b>${esc(name)}</b></div><p class="wp-story">${esc(story)}</p>`;
  if (st) {
    const doneN = st.rows.filter((r) => r.state === 'done').length;
    right += `<ul class="wp-goals">${st.rows.map((r) => `<li class="${r.state}"><i>${r.state === 'done' ? SVG.check : r.state === 'now' ? SVG.dot : SVG.lock}</i><span>${esc(r.text)}</span><em>${GOAL_WORD[r.state]}</em></li>`).join('')}</ul>`;
    right += `<div class="wp-rate"><span>達成率 ${doneN}/${st.n}</span><span class="wp-seg" role="img" aria-label="${st.n}のうち${doneN}">${st.rows.map((r) => `<i class="${r.state}"></i>`).join('')}</span></div>`;
    const cur = st.rows[st.i], next = st.rows[st.i + 1];
    right += `<div class="wp-now">現在：${esc(cur?.text || '')}</div>${next ? `<div class="wp-next">次：${esc(next.text)}</div>` : ''}`;
  }
  right += '</div>';
  return `<section class="wp" aria-labelledby="wp-h"><h4 id="wp-h"><span class="wp-mon">${SVG.mon}</span>合戦の進行</h4><div class="wp-body">${left}${right}</div></section>`;
}

export const WAR_CSS = `
#pause .wp { grid-column:1/-1; text-align:left; box-sizing:border-box; width:100%; padding:12px 14px 14px; background:linear-gradient(#1b1712,#0f0d0a); border:1px solid #b8913f; box-shadow:inset 0 0 0 3px #0f0d0a, inset 0 0 0 4px rgba(184,145,63,.45); color:#f3ead6; font-family:"Hiragino Mincho ProN","Yu Mincho","Noto Serif JP",serif; }
#pause .wp h4 { display:flex; align-items:center; gap:8px; margin:0 0 10px; font-size:18px; letter-spacing:.12em; color:#f3e2b4; }
#pause .wp-mon { display:inline-flex; width:24px; height:24px; color:#d9b45a; }
#pause .wp-mon svg, #pause .wp i svg, #pause .wp-th svg { width:100%; height:100%; display:block; }
#pause .wp-body { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1.35fr); gap:14px; }
#pause .wp-list { list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:6px; }
#pause .wp-b { display:grid; grid-template-columns:64px 1fr auto; align-items:center; gap:8px; min-height:44px; padding:4px 8px 4px 4px; background:rgba(255,255,255,.04); border:1px solid rgba(184,145,63,.35); }
#pause .wp-b.now { border:2px solid #c0392b; background:rgba(192,57,43,.16); }
#pause .wp-th { width:64px; height:36px; background:#2a241b center/cover no-repeat; display:flex; align-items:center; justify-content:center; color:#d8d0c0; }
#pause .wp-th svg { width:18px; height:18px; }
#pause .wp-b.lock .wp-th { filter:grayscale(1) brightness(.45); }
#pause .wp-bn { font-size:15px; line-height:1.3; }
#pause .wp-b.lock .wp-bn { color:#a39a8a; }
#pause .wp-b em { font-style:normal; font-size:12px; padding:2px 6px; border:1px solid currentColor; color:#d9b45a; white-space:nowrap; }
#pause .wp-b.now em { color:#ff8a7a; }
#pause .wp-b.lock em, #pause .wp-b.open em { color:#a39a8a; }
#pause .wp-eye { font-size:12px; letter-spacing:.2em; color:#d9b45a; }
#pause .wp-path { margin:2px 0 6px; font-size:13px; color:#cfc4ad; display:flex; flex-wrap:wrap; align-items:baseline; gap:6px; }
#pause .wp-path b { font-size:20px; color:#fff6e0; }
#pause .wp-story { margin:0 0 8px; font-size:15px; line-height:1.55; color:#e8dfcc; }
#pause .wp-goals { list-style:none; margin:0 0 8px; padding:0; display:flex; flex-direction:column; gap:4px; }
#pause .wp-goals li { display:grid; grid-template-columns:20px 1fr auto; align-items:center; gap:8px; font-size:15px; min-height:28px; }
#pause .wp-goals i { width:18px; height:18px; color:#d9b45a; }
#pause .wp-goals li.now i { color:#ff5a46; filter:drop-shadow(0 0 4px rgba(255,70,50,.8)); }
#pause .wp-goals li.now span { color:#fff; font-weight:700; }
#pause .wp-goals li.lock { color:#9d9484; }
#pause .wp-goals li.lock i { color:#8a8274; }
#pause .wp-goals em { font-style:normal; font-size:12px; padding:1px 6px; border:1px solid currentColor; color:#d9b45a; }
#pause .wp-goals li.now em { color:#ff8a7a; }
#pause .wp-goals li.lock em { color:#9d9484; }
#pause .wp-rate { display:flex; align-items:center; gap:10px; font-size:15px; color:#f3e2b4; margin-bottom:6px; }
#pause .wp-seg { display:flex; gap:3px; flex:1; max-width:220px; }
#pause .wp-seg i { flex:1; height:8px; background:#3a3226; border:1px solid #6b5a33; }
#pause .wp-seg i.done { background:#d9b45a; border-color:#d9b45a; }
#pause .wp-seg i.now { background:linear-gradient(90deg,#d9b45a 50%,#3a3226 50%); }
#pause .wp-now { font-size:15px; color:#fff; }
#pause .wp-next { font-size:13px; color:#cfc4ad; }
@media (max-width:700px), (max-height:500px) {
 #pause .wp { padding:10px; }
 #pause .wp-body { grid-template-columns:minmax(0,.9fr) minmax(0,1.3fr); gap:10px; }
 #pause .wp-b { grid-template-columns:48px 1fr auto; }
 #pause .wp-th { width:48px; height:28px; }
 #pause .wp-bn { font-size:13px; }
 #pause .wp-story { font-size:13px; }
 #pause .wp-goals li, #pause .wp-rate, #pause .wp-now { font-size:13px; }
}`;
