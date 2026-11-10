// 今の目標一件を大きく示し、一覧は開いた時だけ見せる。兵数も同じ札へ収める。
// 達成条件と採点は goals5.js のまま。並びを保ち、字が変わる時だけ書く。
import { S } from './settings.js';
import { fiveGoals } from './goals5.js';
import { screenWords } from './screen_words.js';
import { siegePathStrip, hasSiegePath } from './siege_path.js';

const CSS = `
html:root body #hud #h-prog.goal-mode.goal-mode { padding:9px 14px 10px 12px; background:rgba(14,12,10,.66); border:none; border-radius:6px;
 box-shadow:0 2px 10px rgba(0,0,0,.35); width:max-content; min-width:220px; max-width:min(420px, calc(100vw - 140px)); animation:none; transform:none; }
/* 折れる時は「〜で／〜を」の語の切れ目だけで折り、「討て」「柴／田勢」のように語の途中で落ちないように（t05 critic60「攻め入／る」） */
#hud #h-prog .pg-goals li span { white-space:normal; word-break:keep-all; overflow-wrap:anywhere; text-wrap:balance; line-break:strict; }   /* 11/8 critic60 本能寺：「守／る」と一字だけ次の行へ落とさない */
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
html:root body #hud #h-prog .pg-goals li.now {
 gap:8px; margin:0; padding:4px 0; background:none;
 font-size:max(22px,calc(22px * var(--text-scale,1))); line-height:1.35;
}
#hud #h-prog .pg-goals li.now i { display:none; }
#hud #h-prog .pg-goals li.now::before { content:'●'; flex:none; color:#fff3ba; font-size:14px; /* 今の目標は向きを持たない丸印一つ。 */ }
#hud #h-prog .pg-goals li.now em { font-size:16px; }
html:root body #hud #h-prog.goals-all-rows .pg-goals li.now { font-size:inherit; }
#hud #h-prog.goals-all-rows .pg-goals li.now i { display:block; }
#hud #h-prog.goals-all-rows .pg-goals li.now::before { content:none; }
html:root body #hud #h-prog .pg-goals #armybar {
 position:static !important; width:100% !important; max-width:none !important;
 min-width:0 !important; margin:0 0 6px !important; transform:none !important;
 background:none !important; box-shadow:none !important;
}
`;

// 先手・一の手・寄せ手は戦の言葉のまま（kaito も「先手 18／30」と使う。「林勢の先手」が「林勢の敵」になっていた）
const goalWords = (s) => s.includes('たおせ') ? screenWords(s).replace(/倒せ/g, 'たおせ') : screenWords(s);

// 語の切れ目（で・を・へ・に・と・の・から・まで の後）にだけ折れ目を置く。残りが三字より短い所では折らない
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const phraseBreaks = (s) => esc(s).replace(/(から|まで|[でをへにとの、])(?![、。」）])(?=[^\s]{3,})/g, '$1<wbr>');   // 11/9 iPhone 874×402：「斜面で、」の「で」の後で折れて行の頭が「、」になった。句読点の前では折らない
const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
let styled = false;
// 一件の表示と一覧の開閉を共有する。達成・時間切れの判定は元の目標表のまま。
// 済んだ目標の数と棒を同じ札に示す。経過時間を達成と混ぜない。
export function battleProgress(parent, rt, done, total) {
  let pg = parent._pg;
  if (!pg || pg.parentNode !== parent) {
    pg = parent._pg = document.createElement('div'); pg.className = 'battle-progress'; pg.setAttribute('role', 'status');
    pg.style.cssText = 'display:flex;align-items:center;gap:8px;margin-top:6px;color:#fff3df;font:700 16px/1.4 sans-serif';
    const label = document.createElement('span'); pg.appendChild(label); pg._label = label;
    const f = document.createElement('i'); f.style.cssText = 'display:block;height:100%;width:0;background:#e0b84c;border-radius:2px'; const track = document.createElement('span'); track.style.cssText = 'width:64px;height:5px;background:#514a40'; track.appendChild(f); pg.appendChild(track); pg._f = f;
    parent.appendChild(pg);
  }
  const label = `達成 ${total}分の${done}`;
  if (pg._label.textContent !== label) pg._label.textContent = label;
  const w = Math.round(total ? done / total * 100 : 0);
  if (pg._w !== w) { pg._w = w; pg._f.style.width = w + '%'; }
}
export function goalsTick(el, rt, stg, always) {
  const f = rt.def.goalsList === false ? null : fiveGoals(rt);
  const on = !!((always || !rt.def.missionSingleLine || rt.def.goalsAllRows) && f && f.now >= 0 && !rt.over);
  el.classList.toggle('goal-mode', on);
  const visibleRows = rt.def.goalsVisibleRows ? Math.max(1, Math.min(5, Math.floor(rt.def.goalsVisibleRows))) : rt.def.goalsAllRows ? f?.rows.length || 1 : Math.max(1, Math.min(5, Math.floor(rt.def.goalVisibleRows || 1)));
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
  const firstRow = rt.def.goalsVisibleRows ? Math.min(now, Math.max(0, f.rows.length - visibleRows)) : rt.def.goalsAllRows ? 0 : rt.def.goalRowsAhead ? Math.min(now, Math.max(0, f.rows.length - visibleRows)) : Math.max(0, now - visibleRows + 1);
  const key = now + '@' + f.rows.map((g, i) => (g.done ? '1' : g.fail ? 'x' : i === now ? 'n' : '0') + goalWords(g.text) + (g.count ? g.count.join('/') : '') + (g.left != null ? 't' : '')).join('|');
  // 残り時間は今の目標の行だけ。秒が変わる時だけ書き、並びは作り直さない
  const tm = box.querySelector('li.now .tm');
  if (tm) {
    const r = f.rows[f.now], s = '';
    if (s !== tm.textContent) { tm.textContent = s; tm.className = 'tm' + (!s ? '' : r.left <= 30 ? ' crit' : r.left <= 60 ? ' warn' : ''); }
  }
  if (key === G.key) return true;
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
    li.lastChild.innerHTML = phraseBreaks(`${i + 1}　${goalWords(g.text)}`);
    if (g.count && !g.done) {   // 敵の隊は赤い字・倒した数が一人ごとに上がる（kaito 11/3 AV16）
      const em = document.createElement('em'); em.textContent = `（${g.count[1]}分の${g.count[0]}）`;   /* 決めた総数と討った数を並べる（11/9 四回目・16） */ em.style.cssText = 'color:#ff6a58;font-weight:800';
      // 数は目標の字の後ろへ続けて置く（横の別の列に置くと、844×390 で目標の字が四行に押し込まれ「討／つ」と語の途中で折れた・11/8 天王寺の通し）
      const sp = li.lastChild; sp.style.color = '#ff8a78'; sp.appendChild(em);
    }
    li.setAttribute('aria-label', (i === now ? '今：' : g.done ? '達成：' : g.fail ? '失敗：' : '目標：') + goalWords(g.text) + (g.count ? ` ${g.count[1]}分の${g.count[0]}` : ''));
    // 残り時間の字は出さない（画面の字は名前・人数・目標・命だけ）
    ul.appendChild(li);
  });
  return true;
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
