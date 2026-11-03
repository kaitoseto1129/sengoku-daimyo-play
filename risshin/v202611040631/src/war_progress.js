// 章の進みと「合戦の進行」（kaito 11/1 昼の手本・docs/kaito_play_1101.md の J・K）。
// 章の並び（CHAPTERS）・戦の中の目標の並び（stages.js の段）・止めた時の「合戦の進行」の札の中身を一か所に置く。
// 目標の中身と進みの判定は stages.js（B の係と同じ物を読む）。ここは見せ方だけ。
import { ODA_LINE, lineOf } from './state.js';
import { STAGES, stageNow } from './stages.js';
import { TOKUGAWA_LINE } from './tokugawa_line.js';
import { TOYOTOMI_LINE } from './toyotomi_line.js';
import { tokuWon } from './tokugawa_secret.js';

// 織田家編の章。戦の並び（ODA_LINE）の id で引く。
export const CHAPTERS = [
  { name: '尾張統一と美濃攻め', ids: ['inou', 'okehazama', 'moribe', 'sunomata', 'inabayama'] },
  { name: '上洛と包囲網', ids: ['mitsukuri', 'okawachi', 'kanegasaki', 'anegawa', 'nodafukushima', 'shiga', 'hieizan'] },
  { name: '武田と浅井・朝倉', ids: ['mikatagahara', 'tonezaka', 'odani', 'nagashima', 'shitaragahara'] },
  { name: '一向一揆と本願寺', ids: ['echizen', 'echizen_ikko', 'iwamura', 'tennoji', 'saika', 'tedorigawa', 'shigisan', 'kizugawa'] },
  { name: '天下布武の果て', ids: ['miki', 'arioka', 'iga', 'tottori', 'takato', 'tano', 'honnoji'] },
];
// 徳川編の章（docs/chapter3_tokugawa.md の流れ）。勝った戦は tokuWon() で読む。秘密の戦は章の並びに出さない
const TOKU_CHAPTERS = [
  { name: '関ヶ原への道', ids: ['k01_fushimi', 'k02_kawada', 'k03_gifu', 'k04_kuisegawa', 'k05_ueda', 'k06_sekigahara', 'k07_sawayama'] },
  { name: '大坂冬の陣', ids: ['k08_osaka_kizu', 'k09_imafuku', 'k10_shigino', 'k11_sanadamaru'] },
  { name: '大坂夏の陣', ids: ['k12_kashii', 'k13_domyoji', 'k14_yao_wakae', 'k15_tennoji_okayama'] },
];

// 戦の筋の短い説明（二〜三行）。無い戦は年と場所から作る。
const STORY = {
  inou: '信長の弟・信勝を主に立てようと、柴田勝家と林美作守が兵を挙げた。信長の七百が、倍を超える敵と稲生の野で向き合う。',
  okehazama: '今川義元の大軍が尾張へ攻め込んだ。雨に紛れて桶狭間の本陣へ迫り、義元の首を狙う。',
  moribe: '斎藤義龍が死に、美濃が揺れている。雨の川を渡り、森部で斎藤勢の大将たちを討つ。',
  sunomata: '美濃攻めの足がかりに、敵の目の前の墨俣へ砦を築く。寄せてくる斎藤勢から柵を守り抜く。',
  inabayama: '斎藤龍興の稲葉山城を攻める。城下に火を放ち、山道から城へ迫る。',
  k01_fushimi: '家康は会津へ向かい、三成ら西軍が兵を挙げた。鳥居元忠と伏見城に籠り、西軍の大軍から時を稼ぐ。',
  k02_kawada: '東軍の先手が尾張から美濃へ攻め入る。木曽川の渡しを、鉄砲と弓を受けながら押し渡る。',
  k03_gifu: '信長の孫・織田秀信が岐阜城に籠る。かつて信長と攻めた稲葉山を、今度は徳川方で攻め上る。',
  k04_kuisegawa: '関ヶ原の前の日。島左近が杭瀬川で東軍を誘い出す。追えば伏兵が待っている。',
  k05_ueda: '秀忠の軍が中山道を西へ。真田昌幸・信繁の上田城を攻めるが、城下と川に誘われ乱される。',
  k06_sekigahara: '霧の関ヶ原で東西の大軍が向き合う。井伊・松平の抜け駆けで戦が始まり、小早川の寝返りを待つ。',
  k07_sawayama: '関ヶ原の後、三成の居城・佐和山を囲む。主のいない城で、石田の一族が最後まで抗う。',
  k08_osaka_kizu: '十四年の後。秀頼が浪人を集め、徳川が大坂城を囲む。夜、木津川口の砦を攻める。',
  k09_imafuku: '大坂城の北東、今福の堤。湿地の細い道で、木村重成と後藤又兵衛の反撃を受ける。',
  k10_shigino: '上杉景勝の軍と鴫野へ。大坂方の反撃に苦しんでも、堤に踏みとどまる。',
  k11_sanadamaru: '大坂城の南に、真田信繁が出丸を築いた。誘われて寄せれば、堀と柵の前で一斉に撃たれる。',
  k12_kashii: '夏の陣の始まり。紀州の浅野勢と、先に出た塙団右衛門を樫井で迎え撃つ。',
  k13_domyoji: '奈良からの道を大坂へ。小松山に先に出た後藤又兵衛を、伊達・水野と攻める。',
  k14_yao_wakae: '大坂方が河内の田へ出た。若江で木村重成と、八尾で長宗我部盛親と、二つの戦が同時に始まる。',
  k15_tennoji_okayama: '大坂の陣の最後の野戦。真田信繁が家康の本陣へ何度も突きかかる。',
};

const thumb = (id) => new URL(`../assets/thumbs/${id}.webp`, import.meta.url).href;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// 今の戦の名前（戦の画面の左上に出す）
export function battleName(rt) {
  const k = rt?.def?.key;
  const b = k && (ODA_LINE.find((x) => x.id === k) || TOYOTOMI_LINE.find((x) => x.id === k) || TOKUGAWA_LINE.find((x) => x.id === k));
  return b?.name || rt?.def?.title || rt?.def?.name || '';
}

export function chapterOf(key) {
  const k = CHAPTERS.findIndex((c) => c.ids.includes(key));
  if (k >= 0) return { k, ...CHAPTERS[k] };
  const t = TOKU_CHAPTERS.findIndex((c) => c.ids.includes(key));
  return t < 0 ? null : { k: CHAPTERS.length + t, toku: true, ...TOKU_CHAPTERS[t] };
}
const shortName = (name) => name.replace(/の戦い$|の戦$|の決戦$/, '').replace(/^大坂冬の陣・/, '').replace(/[・（].*$/, '');

// 章の戦の並びと、それぞれの状態（done／now／open／lock）
export function chapterRows(rt) {
  const ch = chapterOf(rt?.def?.key);
  if (!ch) return null;
  const G = rt.G || {};
  if (ch.toku) {
    // 徳川編：できた戦はどれも開いている。勝った戦は済み
    const won = new Set(tokuWon());
    const rows = ch.ids.map((id) => {
      const b = TOKUGAWA_LINE.find((x) => x.id === id) || { id, name: id };
      return { id, name: b.name, short: shortName(b.name), state: id === rt.def.key ? 'now' : won.has(id) ? 'done' : 'open' };
    });
    return { ...ch, rows };
  }
  const line = lineOf(G);
  // 勝った戦が済み。前の戦に勝って初めて開く（kaito 11/2 W・hub.js の battleWon と同じ見方）
  const won = (j) => { const h = G.history?.[j], g = (G.grades || [])[j]; return h?.won === true || (h?.won !== false && !!g && g !== '丙'); };
  const rows = ch.ids.map((id) => {
    const b = ODA_LINE.find((x) => x.id === id) || { id, name: id };
    const j = line.findIndex((x) => x.id === id);
    const state = id === rt.def.key ? 'now' : j < 0 || won(j) ? 'done' : j <= 0 || won(j - 1) ? 'open' : 'lock';
    return { id, name: b.name, short: b.name.replace(/の戦い$|の戦$|の決戦$/, '').replace(/[・（].*$/, ''), state };
  });
  return { ...ch, rows };
}

// 目標の並び（毎回五つ。stages.js の five）：済んだ物・今の物・いつでも果たせる物・まだ先の物。段の無い戦は null
export function stageRows(rt) {
  const now = rt?.def && stageNow(rt);
  if (!now) return null;
  // 五つの目標（now.five）の無い戦は、段の並び（済んだ物・今の物・まだ先の物）
  if (!now.five) {
    const list = STAGES[rt.def.key];
    if (!list) return null;
    const done = rt.over && rt.tracker?.main === true;
    return { i: now.i, n: now.n, rows: list.map((s, k) => ({ text: s[0], state: done || k < now.i ? 'done' : k === now.i ? 'now' : 'lock' })) };
  }
  const rows = now.five;
  const i = rows.findIndex((r) => r.state === 'now');
  return { i: i < 0 ? rows.length - 1 : i, n: rows.length, rows };
}

// 進行率（0〜1）。五つの目標のうち済んだ数から。
export function stagePercent(rt, st) {
  if (!st) return 0;
  if (rt.over && rt.tracker?.main === true) return 1;
  return st.rows.filter((r) => r.state === 'done').length / st.n;
}

export const SVG = {
  check: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5l3.2 3.2L13 4.6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  dot: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="8" cy="8" r="3.4" fill="currentColor"/></svg>',
  box: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2.5" y="2.5" width="11" height="11" rx="1" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
  lock: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 7V5.2a3 3 0 0 1 6 0V7" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="3.4" y="7" width="9.2" height="7" rx="1.2" fill="currentColor"/></svg>',
  mon: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10.5" fill="none" stroke="currentColor" stroke-width="1.4"/><g fill="currentColor"><ellipse cx="12" cy="6.6" rx="2.6" ry="3.2"/><ellipse cx="17.2" cy="10.4" rx="2.6" ry="3.2" transform="rotate(72 17.2 10.4)"/><ellipse cx="15.2" cy="16.6" rx="2.6" ry="3.2" transform="rotate(144 15.2 16.6)"/><ellipse cx="8.8" cy="16.6" rx="2.6" ry="3.2" transform="rotate(216 8.8 16.6)"/><ellipse cx="6.8" cy="10.4" rx="2.6" ry="3.2" transform="rotate(288 6.8 10.4)"/><circle cx="12" cy="12" r="2"/></g></svg>',
};

// 目標の印：済み ✓・今 ●・いつでも □・先 錠
export const goalIcon = (state) => (state === 'done' ? SVG.check : state === 'now' ? SVG.dot : state === 'open' ? SVG.box : SVG.lock);

const STATE_WORD = { done: '完了', now: '進行中', open: 'これから', lock: '未解放' };
const GOAL_WORD = { done: '完了', now: '進行中', open: '未達', lock: '未達' };

// 止めた時の「合戦の進行」の札（screens.js の pauseMenu の頭へ入れる）
export function warProgressHtml(rt) {
  if (!rt || rt.def?.town || rt.def?.dojo) return '';
  const ch = chapterRows(rt), st = stageRows(rt);
  if (!ch && !st) return '';
  const b = ODA_LINE.find((x) => x.id === rt.def.key) || TOKUGAWA_LINE.find((x) => x.id === rt.def.key);
  const name = b?.name || rt.def.title || '';
  const story = STORY[rt.def.key] || (b?.place ? `${b.year}、${b.place}。` : '');
  const left = ch ? `<ol class="wp-list" aria-label="${esc(ch.name)}の戦">${ch.rows.map((r) => `<li class="wp-b ${r.state}"><span class="wp-th" style="background-image:url('${thumb(r.id)}')">${r.state === 'lock' ? SVG.lock : ''}</span><span class="wp-bn">${esc(r.name)}</span><em>${STATE_WORD[r.state]}</em></li>`).join('')}</ol>` : '';
  let right = `<div class="wp-cur"><div class="wp-eye">現在の任務</div><div class="wp-path">${ch ? `${esc(ch.name)}<span aria-hidden="true">›</span>` : ''}<b>${esc(name)}</b></div><p class="wp-story">${esc(story)}</p>`;
  if (st) {
    const doneN = st.rows.filter((r) => r.state === 'done').length;
    right += `<ul class="wp-goals">${st.rows.map((r) => `<li class="${r.state}"><i>${goalIcon(r.state)}</i><span>${esc(r.text)}</span><em>${GOAL_WORD[r.state]}</em></li>`).join('')}</ul>`;
    right += `<div class="wp-rate"><span>達成率 ${doneN}/${st.n}</span><span class="wp-seg" role="img" aria-label="${st.n}のうち${doneN}">${st.rows.map((r) => `<i class="${r.state}"></i>`).join('')}</span></div>`;
    const cur = st.rows[st.i], next = st.rows[st.i + 1];
    right += `<div class="wp-now">現在：${esc(cur?.text || '')}</div>${next ? `<div class="wp-next">次：${esc(next.text)}</div>` : ''}`;
  }
  right += '</div>';
  return `<section class="wp" aria-labelledby="wp-h"><h4 id="wp-h">合戦の進行</h4><div class="wp-body">${left}${right}</div></section>`;
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
