// 今の目標一件を大きく示し、一覧は開いた時だけ見せる。兵数も同じ札へ収める。
// 達成条件と採点は goals5.js のまま。並びを保ち、字が変わる時だけ書く。
import { S } from './settings.js';
import { fiveGoals } from './goals5.js';
import { screenWords } from './screen_words.js';
import { siegePathStrip, hasSiegePath } from './siege_path.js';
import { VIEW } from './viewport.js';   // 11/17 K365：innerWidth を毎コマ読まない（札を書き換えた後の配置のやり直しを避ける）

const CSS = `
html:root body #hud #h-prog.goal-mode.goal-mode { padding:9px 14px 10px 12px; background:rgba(14,12,10,.66); border:none; border-radius:6px;
 box-shadow:0 2px 10px rgba(0,0,0,.35); width:max-content; min-width:220px; max-width:min(420px, calc(100vw - 140px)); animation:none; transform:none; }
/* 折れる時は「〜で／〜を」の語の切れ目だけで折り、「討て」「柴／田勢」のように語の途中で落ちないように（t05 critic60「攻め入／る」） */
#hud #h-prog .pg-goals li span { white-space:normal; word-break:keep-all; overflow-wrap:anywhere; text-wrap:balance; line-break:strict; min-width:0; flex:1 1 auto; }   /* 11/8 critic60 本能寺：「守／る」と一字だけ次の行へ落とさない */
html:root body #hud#hud #h-prog.goal-mode > :not(.pg-goals) { display:none !important; }
html:root body #hud#hud #h-prog.goal-mode > .pg-goals { display:block !important; }
#hud #h-prog .pg-goals { display:none; color:#fff; text-align:left; text-shadow:0 1px 2px rgba(0,0,0,.8); }
#hud #h-prog.goal-mode .pg-goals { display:block; }
#hud #h-prog .pg-goals h3 { display:flex; align-items:baseline; gap:12px; margin:0 0 6px; font-size:max(17px, calc(17px * var(--text-scale, 1))); font-weight:700; letter-spacing:.08em; color:#fff; line-height:1.3; }
#hud #h-prog .pg-goals h3 b { margin-left:auto; font-size:15px; font-weight:700; letter-spacing:.02em; color:#f3e2b4; font-variant-numeric:tabular-nums; }
#hud #h-prog .pg-goals h3 b[hidden] { display:none; }
#hud #h-prog .pg-goals h3 b.warn { color:#f0c060; }
#hud #h-prog .pg-goals h3 b.crit { color:#ff8a70; }
#hud #h-prog .pg-goals h3 b.over { color:#a39a8a; text-decoration:line-through; }
#hud #h-prog .pg-goals ul { list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:5px; }
#hud #h-prog .pg-goals li { display:flex; align-items:center; gap:10px; font-size:max(15px, calc(15px * var(--text-scale, 1))); line-height:1.3; white-space:nowrap; color:#e6dfd2; }
/* 携帯では今する一件だけ。兵数と同じ札に収める。 */
#hud #h-prog .pg-goals li:not(.now) { display:none; }
#hud #h-prog.goals-all-rows .pg-goals li { display:flex; }
#hud #h-prog .pg-goals .goals-toggle, #hud #h-prog .pg-goals li em.tm { display:none !important; }
#hud #h-prog .pg-goals li i { flex:none; position:relative; width:16px; height:16px; border:2px solid #f3efe6; border-radius:2px; box-sizing:border-box; }
#hud #h-prog .pg-goals li em { font-style:normal; font-size:13px; color:#f3e2b4; font-variant-numeric:tabular-nums; }
#hud #h-prog .pg-goals li em.tm { margin-left:auto; padding-left:10px; }
#hud #h-prog .pg-goals li em.tm.warn { color:#f0c060; }
#hud #h-prog .pg-goals li em.tm.crit { color:#ff8a70; }
#hud #h-prog .pg-goals li.now { color:#fff; font-weight:800; font-size:max(17px, calc(17px * var(--text-scale, 1))); background:rgba(224,38,26,.28); border-radius:4px; margin:0 -5px; padding:2px 5px; }
#hud #h-prog .pg-goals li.now i { border-color:#ff5a46; box-shadow:0 0 6px rgba(255,70,50,.8); }
#hud #h-prog .pg-goals li.now i::before { content:""; position:absolute; left:3px; top:3px; width:6px; height:6px; border-radius:50%; background:#ff5a46; }
#hud #h-prog .pg-goals li.done i { border-color:#9fe08a; }
#hud #h-prog .pg-goals li.done i::after { content:""; position:absolute; left:3px; top:-5px; width:6px; height:13px; border:solid #9fe08a; border-width:0 3px 3px 0; transform:rotate(40deg); }
#hud #h-prog .pg-goals li.done span { color:#cfc9bc; }
#hud #h-prog .pg-goals li.fail { color:#8f887c; }
#hud #h-prog .pg-goals li.fail span { text-decoration:line-through; }
#hud #h-prog .pg-goals li.fail i { border-color:#ff6a50; background:rgba(255,90,70,.22); }
#hud #h-prog .pg-goals li.fail i::before, #hud #h-prog .pg-goals li.fail i::after { content:""; position:absolute; left:5px; top:0; width:3px; height:12px; background:#ff8a70; transform:rotate(45deg); }
#hud #h-prog .pg-goals li.fail i::after { transform:rotate(-45deg); border:0; }
#hud #h-prog .pg-goals li.pop i { animation:goal-pop .45s ease-out 1; }
@keyframes goal-pop { 0% { transform:scale(1); } 40% { transform:scale(1.45); } 100% { transform:scale(1); } }
body.rm #hud #h-prog .pg-goals, body.rm #hud #h-prog .pg-goals * { animation:none !important; transition:none !important; }
@media (prefers-reduced-motion:reduce) { #hud #h-prog .pg-goals, #hud #h-prog .pg-goals * { animation:none !important; transition:none !important; } }
/* 稲生だけにあった上の真ん中の時の棒は、目標の見出しの残り時間と二重になる */
#tl-bar { display:none !important; }
@media (max-height:500px) {
 html:root body #hud #h-prog.goal-mode.goal-mode { padding:6px 10px 7px 9px; min-width:180px; }
 #hud #h-prog .pg-goals h3 { font-size:14px; margin-bottom:3px; }
 #hud #h-prog .pg-goals h3 b { font-size:13px; }
 #hud #h-prog .pg-goals ul { gap:2px; }
 #hud #h-prog .pg-goals li { font-size:13px; gap:7px; }
 #hud #h-prog .pg-goals li em { font-size:12px; }
 #hud #h-prog .pg-goals li i { width:13px; height:13px; }
 #hud #h-prog .pg-goals li.now i::before { left:2px; top:2px; width:5px; height:5px; }
 #hud #h-prog .pg-goals li.done i::after { left:2px; top:-5px; width:5px; height:11px; }
 #hud #h-prog .pg-goals li.fail i::before, #hud #h-prog .pg-goals li.fail i::after { left:4px; height:10px; }
}
html:root body #hud #h-prog.goal-mode.goal-mode {
 box-sizing:border-box; width:min(320px,36vw); min-width:0; max-width:calc(100vw - 16px);
 max-height:none; padding:8px 10px; background:#14120f; text-align:left;
}
#hud #h-prog .pg-goals h3 { display:none; }
html:root body #hud#hud#hud #h-prog#h-prog.current-action .pg-goals :is(h3,.battle-progress) { display:none !important; }
#hud #h-prog .pg-st span { text-shadow:0 1px 2px #000, 0 0 4px #000; }
html:root body #hud #h-prog .pg-goals li.now {
 gap:8px; margin:0; padding:4px 0; background:none;
 font-size:max(22px,calc(22px * var(--text-scale,1))); line-height:1.35;
}
#hud #h-prog .pg-goals li.now i { display:none; }
#hud #h-prog .pg-goals li.now::before { content:'●'; flex:none; color:#fff3ba; font-size:14px; /* 今の目標は向きを持たない丸印一つ。 */ }
#hud #h-prog .pg-goals li.now em { font-size:18px; }
html:root body #hud #h-prog.goals-all-rows .pg-goals li.now { font-size:inherit; }
/* 田野は五目標を残す。携帯横で現在行だけ大きく継承して札が膨らむのを防ぐ。 */
@media (max-height:500px) {
 html:root body #hud #h-prog[data-battle="tano"].goals-all-rows .pg-goals li,
 html:root body #hud #h-prog[data-battle="tano"].goals-all-rows .pg-goals li.now {
  font-size:max(15px,calc(15px * var(--text-scale,1))); line-height:1.3; gap:6px; padding:0;
 }
 html:root body #hud #h-prog[data-battle="tano"] .pg-goals ul { gap:3px; }
}
/* 11/10 iPhone 横 874×402 の見回り：五つを並べる戦（小田原・山崎など）で、済んでいない段が二行ずつ折れて札が画面の四割近くを覆い、
   右下の「守る」「突く」に被った。携帯の背の低い画面では、今の段の他は一行に詰めて末を「…」にする（①から全部並べる決まりは残す）。 */
@media (max-height:500px) {
 html:root body #hud#hud#hud#hud #h-prog#h-prog#h-prog.goals-all-rows .pg-goals li:not(.now) {
  font-size:13px !important; line-height:1.25 !important; gap:6px !important; padding:0 !important; white-space:nowrap !important;
 }
 html:root body #hud#hud#hud#hud #h-prog#h-prog#h-prog.goals-all-rows .pg-goals li:not(.now) span {
  white-space:nowrap !important; overflow:hidden !important; text-overflow:ellipsis !important; min-width:0;
 }
 html:root body #hud#hud#hud#hud #h-prog#h-prog#h-prog.goals-all-rows .pg-goals li:not(.now) i { width:13px; height:13px; }
 html:root body #hud#hud#hud#hud #h-prog#h-prog#h-prog.goals-all-rows .pg-goals ul { gap:2px !important; }
}
/* 田野の五番目は三人の最期までが任務。省略で場所や行いを欠かさず枠内へ折る。 */
html:root body #hud#hud#hud#hud #h-prog#h-prog#h-prog[data-battle="tano"].goals-all-rows .pg-goals li span {
 min-width:0; flex:1; white-space:normal !important; overflow:visible !important; text-overflow:clip !important;
}
#hud #h-prog.goals-all-rows .pg-goals li.now i { display:block; }
/* 11/14 司令塔 束C：右上の任務札は全戦で一行。今の目標も折らずに末を「…」へ（三行で画面を塞いだ） */
/* K360（11/17 kaito・長篠「大宮前の柵の内で、寄せる武田の物見…」）：一行で末を「…」で切ると、何をするかが読めない。
   字は増やさず、収まらない時だけ二行まで折る（三行以上にはしない）。折り目は語の切れ目（上の決まり） */
html:root body #hud#hud#hud#hud #h-prog#h-prog#h-prog .pg-goals li span[data-clamp] { white-space:normal !important; overflow:hidden !important; text-overflow:clip !important; min-width:0; display:-webkit-box !important; -webkit-box-orient:vertical; -webkit-line-clamp:2; line-clamp:2; flex:1 1 auto; word-break:normal !important; overflow-wrap:anywhere !important; line-break:strict; }   /* 語の塊が一行より長いと番号だけが一行目に残った（長篠）。この一行は字の間でも折る */
html:root body #hud#hud#hud#hud #h-prog#h-prog#h-prog .pg-goals li { white-space:normal !important; min-width:0; }
html:root body #hud#hud#hud#hud #h-prog#h-prog#h-prog.goal-mode { max-width:min(46vw, 520px) !important; }
html:root body #hud#hud#hud#hud #h-prog#h-prog#h-prog .pg-goals li span[data-clamp] em { display:inline; }
/* 11/14 束C（クラウドC）：右上は「両軍の人数＋任務一行」だけ。「目標 あとNこ」の字の行は出さず、城攻めの区画の帯も背の低い携帯では出さない（稲葉山の札が三段で画面の四割） */
#hud #h-prog .pg-goals .battle-progress { display:none !important; }
@media (max-height:500px) { html:root body #hud #h-prog .pg-goals .siege-path { display:none !important; } }
#hud #h-prog.goals-all-rows .pg-goals li.now::before { content:none; }
html:root body #hud #h-prog .pg-goals #armybar {
 position:static !important; width:100% !important; max-width:none !important;
 min-width:0 !important; margin:0 0 6px !important; transform:none !important;
 background:none !important; box-shadow:none !important;
}

/* 数の補足は目標の下へ。本文と同じ大きさで場所を奪わない。 */
#hud #h-prog .pg-goals li em.goal-count { display:block; font-size:max(13px,calc(13px * var(--text-scale,1))); line-height:1.4; }
#hud #h-prog .battle-progress { font-size:max(20px,calc(20px * var(--text-scale,1))) !important; gap:8px !important; margin-top:3px !important; font-variant-numeric:tabular-nums; }
#hud #h-prog .battle-progress > span:last-child { display:none !important; }
/* 墨俣は短い一行と進み具合に収める。拡大時は省略せず折り返す。 */
html:root body #hud#hud#hud.battle-order #h-prog#h-prog[data-battle="sunomata"].goal-mode {
 width:min(320px,calc(100vw - 24px)) !important; max-width:calc(100vw - 24px) !important; padding:6px 10px !important;
}
html:root body #hud#hud#hud.battle-order #h-prog#h-prog[data-battle="sunomata"].goal-mode .pg-goals li.now {
 font-size:max(20px,calc(20px * var(--text-scale,1))) !important; line-height:1.3 !important; gap:4px !important; padding:2px 0 !important;
}
#hud #h-prog[data-battle="sunomata"] .battle-progress > span:last-child { min-width:32px !important; max-width:48px !important; }
#hud #h-prog[data-battle="sunomata"] .pg-goals li.now::before { content:none; }
html:root body #hud#hud#hud.battle-order #h-prog#h-prog[data-battle="sunomata"] .pg-goals #armybar#armybar { margin-bottom:3px !important; gap:3px !important; }
html:root body #hud#hud#hud.battle-order #h-prog#h-prog.goal-mode .pg-goals li em.goal-count { font-size:max(20px,calc(20px * var(--text-scale,1))) !important; }
html:root body #hud#hud#hud.battle-order #h-prog#h-prog.goal-mode .pg-goals h3:has(b:not([hidden])) { display:flex !important; margin:0; }

`;

// 先手・一の手・寄せ手は戦の言葉のまま（kaito も「先手 18／30」と使う。「林勢の先手」が「林勢の敵」になっていた）
const goalWords = (s) => s.includes('たおせ') ? screenWords(s).replace(/倒せ/g, 'たおせ') : screenWords(s);

// 語の切れ目（で・を・へ・に・と・の・から・まで の後）にだけ折れ目を置く。残りが三字より短い所では折らない
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
// K087（11/13 司令塔）：「幕の／口から」のように、二字までの語の「の」の後では折らない（幕の口・寺の門は一語に読む）
const phraseBreaks = (s) => {
  const t = esc(s); let last = 0;
  return t.replace(/(から|まで|[でをへにとの、])(?![、。」）])(?=[^\s]{3,})/g, (m, p, off) => {
    if (p === 'の' && t.slice(last, off).split(/[\s　]/).pop().length < 3) return m;
    last = off + m.length; return m + '<wbr>';
  });
};   // 11/9 iPhone 874×402：「斜面で、」の「で」の後で折れて行の頭が「、」になった。句読点の前では折らない
const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
let styled = false;
// 一件の表示と一覧の開閉を共有する。達成・時間切れの判定は元の目標表のまま。
// 済んだ目標の数と棒を同じ札に示す。経過時間を達成と混ぜない。
export function battleProgress(parent, rt, done, total) {
  let pg = parent._pg;
  if (!pg || pg.parentNode !== parent) {
    pg = parent._pg = document.createElement('div'); pg.className = 'battle-progress'; pg.setAttribute('role', 'status');
    pg.style.cssText = 'display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:6px;color:#fff3df;font:700 max(18px,calc(18px * var(--text-scale,1)))/1.4 sans-serif';
    const label = document.createElement('span'); pg.appendChild(label); pg._label = label;
    const f = document.createElement('i'); f.style.cssText = 'display:block;height:100%;width:0;background:#e0b84c;border-radius:2px'; const track = document.createElement('span'); track.style.cssText = 'flex:1;min-width:64px;max-width:120px;height:8px;background:#514a40'; track.setAttribute('aria-hidden', 'true'); track.appendChild(f); pg.appendChild(track); pg._f = f;
    parent.appendChild(pg);
  }
  const remaining = Math.max(0, total - done);
  // 手順の数を倒す人数に見せない。戦が示す人数は、実際の敵から数える。
  const detail = rt.def.missionProgress?.(rt);
  pg.style.display = detail === '' ? 'none' : 'flex';
  pg.lastChild.style.display = detail != null ? 'none' : '';
  const label = detail ?? (remaining ? `手順 あと${remaining}件` : '目標 すべて達成');
  const shown = rt.def.key === 'sunomata' ? `${label}・制限時間なし` : label;
  if (pg._label.textContent !== shown) pg._label.textContent = shown;
  const w = Math.round(total ? done / total * 100 : 0);
  if (pg._w !== w) { pg._w = w; pg._f.style.width = w + '%'; }
}
export function goalsTick(el, rt, stg, always) {
  const f = rt.def.goalsList === false ? null : fiveGoals(rt);
  // 全達成後も締めが続く戦は、一覧を閉じて兵数だけ外へ移さない。
  const on = !!((always || !rt.def.missionSingleLine || rt.def.goalsAllRows) && f &&
    (f.now >= 0 || (rt.def.goalsKeepCompleted && f.rows.length > 0 && f.rows.every(g => g.done))) && !rt.over);
  el.classList.toggle('goal-mode', on);
  const currentAction = rt.def.goalsCurrentAction ? rt.def.missionHeading?.(rt) || '' : '';
  el.classList.toggle('current-action', !!currentAction);
  // 右上のミッションは同時に三つまで（kaito 11/9 夜 K184）。全部を並べる戦も、今の目標を含む三件に絞る
  // 11/14 司令塔（束C）：三行の札が画面を塞いだ。全戦で今の目標の一行だけにする（戦ごとの goalsVisibleRows・goalsAllRows の指定より先）
  const visibleRows = 1;
  el.classList.toggle('goals-all-rows', visibleRows > 1);
  if (!on) {
    const army = document.getElementById('armybar');
    if (army && el.contains(army)) el.parentNode.appendChild(army);
    return false;
  }
  if (!styled) { styled = true; const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st); }
  let box = el.querySelector('.pg-goals');
  if (!box) {
    box = makeGoalsBox();
    el.appendChild(box);
  }
  const army = document.getElementById('armybar');
  if (army && army.parentNode !== box) box.prepend(army);
  // 城攻めは区画の帯（山麓✓ › 鹿垣✓ › 七曲り● …・siege_path.js）を達成の棒の代わりに出す
  if (hasSiegePath(rt)) { if (box._pg) box._pg.style.display = 'none'; siegePathStrip(box, rt, f.rows); }
  else { if (box._pg) box._pg.style.display = 'flex'; if (box._sp) { box._sp.remove(); box._sp = null; } battleProgress(box, rt, f.rows.filter(g => g.done).length, f.rows.length); }
  const G = el._goals && el._goals.rt === rt ? el._goals : (el._goals = { rt, key: '', clock: '' });
  if (!G.key) {
    box.classList.remove('goals-expanded');
    const toggle = box.querySelector('button');
    toggle.setAttribute('aria-expanded', 'false'); toggle.textContent = '目標を開く';
  }
  const still = !!S.reduceMotion;
  // 今の一件を表示し、ほかの目標は一覧を開いた時だけ見せる。
  const now = f.now >= 0 ? f.now : f.rows.findIndex(g => !g.done && !g.fail);
  // 六段以上の戦でも、今の目標を含む五件までを順番どおりに残す。
  // K360（11/17 n-hetsugi の再検品・樫井）：全部済んだ後の余韻で、札が済んだ①だけに戻っていた。全部済んだら最後の段（済の印つき）を残す
  const allDone = now < 0 && f.rows.length > 0 && f.rows.every(g => g.done);
  const firstRow = allDone ? Math.max(0, f.rows.length - visibleRows) : rt.def.goalsVisibleRows || rt.def.goalsAllRows ? Math.min(Math.max(0, now), Math.max(0, f.rows.length - visibleRows)) : rt.def.goalRowsAhead ? Math.min(Math.max(0, now), Math.max(0, f.rows.length - visibleRows)) : Math.max(0, now - visibleRows + 1);
  // 携帯の横向きへ変えた時も折り返しを作り直す。目標の字だけを比べると、前の <wbr> が残って一行に収まらない。
  const compactRows = VIEW.h <= 500;
  const key = currentAction + '@' + now + ':' + compactRows + '@' + f.rows.map((g, i) => (g.done ? '1' : g.fail ? 'x' : i === now ? 'n' : '0') + goalWords(g.text) + (g.count ? g.count.join('/') : '') + (g.left != null ? 't' : '')).join('|');
  // 残り時間は今の目標の行だけ。秒が変わる時だけ書き、並びは作り直さない
  const time = box.querySelector('h3 b');
  // 11/17 K358（稲生の写真）：限りの無い目標（残り 99 万秒など）が「残り 16666:38」と出ていた。一時間を超える残りは時の札を出さない
  const left0 = f.rows[now]?.left, left = left0 != null && left0 < 3600 ? left0 : null;
  time.parentNode.style.display = left == null ? '' : 'flex';
  time.hidden = left == null;
  if (left != null) time.textContent = `残り ${clock(left)}`;
  const tm = box.querySelector('li.now .tm');
  if (tm) {
    const r = f.rows[f.now], s = '';
    if (s !== tm.textContent) { tm.textContent = s; tm.className = 'tm' + (!s ? '' : r.left <= 30 ? ' crit' : r.left <= 60 ? ' warn' : ''); }
  }
  if (key === G.key) { fitGoalLine(box, G); return true; }
  const ul = box.querySelector('ul'), before = G.key ? G.key.split('@').pop().split('|') : [];
  G.key = key;
  ul.textContent = '';
  f.rows.forEach((g, i) => {
    if (i < firstRow || i >= firstRow + visibleRows) return;
    const li = document.createElement('li');
    li.className = i === now ? 'now' : g.done ? 'done' : g.fail ? 'fail' : '';
    // 今まで済んでいなかった物が済んだ時だけ弾ませる
    if (g.done && before[i] && before[i][0] !== '1' && !still) li.classList.add('pop');
    li.innerHTML = '<i aria-hidden="true"></i><span></span>';
    // 携帯の背の低い画面では、今の段の他は一行に詰める（CSS の @media と同じ境目）。<wbr> は nowrap でも折れるので入れない（11/10 関ヶ原 874×402）
    // 今の一行も折り返さず、枠に収まらない末は「…」（全文は aria-label に残す。11/14 一行化）
    const oneRow = true;
    li.lastChild.innerHTML = (oneRow ? esc : phraseBreaks)(`${i + 1}　${goalWords(g.text)}`);
    // 11/18 クラウド04（伊賀の200秒 874×402「登／り」）：今の段の行は二行に折れて語の途中で切れた。今の行だけ語の切れ目で折る
    if (i === now) { li.lastChild.innerHTML = phraseBreaks(`${i + 1}　${goalWords(g.text)}`); li.lastChild.style.setProperty('word-break', 'keep-all', 'important'); li.lastChild.style.setProperty('overflow-wrap', 'normal', 'important'); }
    // 携帯で今でない段を一行に詰めて「…」にするのはわざと（全文は aria-label と今の段で出る）。audit の「枠から切れ」に数えない（11/11 設楽原 act 160回）
    if (oneRow) li.lastChild.setAttribute('data-clamp', '');
    const countText = g.count ? (rt.def.goalCountLabel
      ? `${rt.def.goalCountLabel}${g.count[0]}人／${g.count[1]}人`
      : `${g.count[0]}/${g.count[1]}`) : '';   // 11/17 K358（稲生の写真）：「28分の1」が二十八分の時の様に読めた。数は 1/28 の形に
    // 11/18 クラウド（岐阜城の写真 203秒）：倒す数を満たした後も持ち場へ着くまで段が明けず「13/13」が赤いまま残り、まだ何か足りないように見えた。満ちた数は出さない（行き先はピンで分かる）
    if (g.count && !g.done && !(g.count[0] >= g.count[1])) {   // 敵の隊は赤い字・倒した数が一人ごとに上がる（kaito 11/3 AV16）
      const em = document.createElement('em'); em.textContent = ` ${countText}`; em.dataset.short = ` ${g.count[0]}/${g.count[1]}`; em.style.cssText = 'color:#ff6a58;font-weight:800';   // K358（桶狭間の写真）：括弧の分だけ一行が溢れ、数が「1…」と欠けた
      // 数は目標の字の後ろへ続けて置く（横の別の列に置くと、844×390 で目標の字が四行に押し込まれ「討／つ」と語の途中で折れた・11/8 天王寺の通し）
      const sp = li.lastChild; sp.style.color = '#ff8a78'; sp.appendChild(em);
    }
    li.setAttribute('aria-label', (i === now ? '今：' : g.done ? '達成：' : g.fail ? '失敗：' : '目標：') + goalWords(g.text) + (countText ? ` ${countText}` : ''));
    // 残り時間の字は出さない（画面の字は名前・人数・目標・命だけ）
    ul.appendChild(li);
  });
  G.fitAt = 0; fitGoalLine(box, G);
  return true;
}
// 一行に収まらない時は字を一段ずつ小さく（13px まで）。それでも余る末だけ「…」（11/14 一行化：動詞が切れて何をするか分からなくなった）
//   札が隠れている間（開始の札）は幅が0で測れないので、半秒ごとに測り直す
function fitGoalLine(box, G) {
  const t = performance.now();
  if (t < (G.fitAt || 0)) return;
  G.fitAt = t + 500;
  const sp = box.querySelector('li span[data-clamp]');
  if (!sp) return;
  // 同じ札・同じ字・同じ画面の幅なら、前に合わせた大きさのまま（字の大きさを外して測り直すと、半秒ごとに配置を二度やり直していた。11/17 K365）
  if (G.fitDone === sp && G.fitTxt === sp.textContent && G.fitVW === innerWidth) return;
  G.fitTxt = sp.textContent; G.fitVW = innerWidth;
  sp.style.removeProperty('font-size');
  const w = sp.clientWidth;
  // 11/18 クラウド k365-cloud-13（樫井 874×402：札が16px のまま二行の末「…」で切れた）：同じ札の中で字（数）が替わっても幅だけで「測り済み」とし、前の字の大きさを使い回していた。字が同じ時だけ使い回す
  if (w < 60 || (G.fitDone === sp && G.fitW === w && G.fitTxt === sp.textContent)) { if (G.fitDone === sp && G.fitFs) sp.style.setProperty('font-size', G.fitFs, 'important'); return; }
  let fs = parseFloat(getComputedStyle(sp).fontSize) || 17;
  // 11/17 iMac の検品（三木 874×402）：二行に折る札は横に溢れず、縦に溢れて「別所勢を…」と動詞が切れていた。縦の溢れも測る
  const over = () => sp.scrollWidth > sp.clientWidth + 1 || sp.scrollHeight > sp.clientHeight + 1;
  // 溢れる時は、まず数を「討ち取り0人／36人」から「0/36」に詰める
  const em = sp.querySelector('em[data-short]');
  if (em && over() && em.textContent !== em.dataset.short) em.textContent = em.dataset.short;
  for (let n = 0; n < 12 && over() && fs > 13; n++) { fs -= 1; sp.style.setProperty('font-size', fs + 'px', 'important'); }
  // 13px でも溢れる時は、数を括弧なしの「0/31」に詰める（「分の」の二字で動詞が「…」に切れた・11/16 長篠 874×402）
  if (em && over() && em.textContent !== em.dataset.short) em.textContent = em.dataset.short;
  G.fitDone = sp; G.fitW = sp.clientWidth; G.fitTxt = sp.textContent; G.fitFs = sp.style.getPropertyValue('font-size');
}

// 目標の札の入れ物。開く釦の聞き手を戦の更新（rt を持つ関数）の中で作ると、閉包が最初の戦をつかみ続けた（11/8 docs/crash_1108.md）
function makeGoalsBox() {
  const box = document.createElement('div'); box.className = 'pg-goals';
  box.innerHTML = '<h3><span>目標</span><b hidden></b></h3><ul id="battle-goal-list"></ul><button type="button" class="goals-toggle" aria-expanded="false" aria-controls="battle-goal-list">目標を開く</button>';
  const toggle = box.querySelector('button');
  toggle.addEventListener('click', event => {
    event.stopPropagation();
    const expanded = box.classList.toggle('goals-expanded');
    toggle.setAttribute('aria-expanded', String(expanded));
    toggle.textContent = expanded ? '目標を閉じる' : '目標を開く';
  });
  return box;
}
