// 右上の「目標」の札（kaito 11/1 の手本 docs/kaito_mission_ref_1101.png・B 節 → 11/2 Q で作り直し）
//   暗い半透明の下地に白い字。見出し「目標」と残り時間の下に、その戦の目標5つ（goals5.js）を最初から全部並べる。
//   済んだ物は印が弾んで ✓、果たせなくなった物は ✕ で字を沈める。今の目標は赤い丸の印で明るく。倒す数は（3／8）。
//   並びは戦の間ずっと変えない（Q「目標がどんどん変わりすぎ」）。字が変わる時だけ書く。毎コマ作らない。
import { S } from './settings.js';
import { fiveGoals } from './goals5.js';

const CSS = `
html:root body #hud #h-prog.goal-mode.goal-mode { padding:9px 14px 10px 12px; background:rgba(14,12,10,.66); border:none; border-radius:6px;
 box-shadow:0 2px 10px rgba(0,0,0,.35); width:max-content; min-width:220px; max-width:min(380px, calc(100vw - 140px)); animation:none; transform:none; }
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
#hud #h-prog .pg-goals li.fail i { border-color:#7a7368; }
#hud #h-prog .pg-goals li.fail i::before, #hud #h-prog .pg-goals li.fail i::after { content:""; position:absolute; left:5px; top:0; width:2px; height:12px; background:#a39a8a; transform:rotate(45deg); }
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
}`;

const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
let styled = false;
// el：右上の任務の札（#h-prog）。目標5つ（goals5.js）を出したら true。stg は前の作りの名残（使わない）
export function goalsTick(el, rt, stg) {
  const f = fiveGoals(rt);
  const on = !!(f && f.rows.length && !rt.over);
  el.classList.toggle('goal-mode', on);
  if (!on) return false;
  if (!styled) { styled = true; const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st); }
  let box = el.querySelector('.pg-goals');
  if (!box) {
    box = document.createElement('div'); box.className = 'pg-goals';
    box.innerHTML = '<h3><span>目標</span><b hidden></b></h3><ul></ul>';
    el.appendChild(box);
  }
  const G = el._goals && el._goals.rt === rt ? el._goals : (el._goals = { rt, key: '', clock: '' });
  const still = !!S.reduceMotion;
  const key = f.rows.map((g, i) => (g.done ? '1' : g.fail ? 'x' : i === f.now ? 'n' : '0') + g.text + (g.count ? g.count.join('/') : '') + (g.left != null ? 't' : '')).join('|');
  // 残り時間は今の目標の行だけ。秒が変わる時だけ書き、並びは作り直さない
  const tm = box.querySelector('li .tm');
  if (tm) {
    const r = f.rows[f.now], s = r && r.left != null ? clock(r.left) : '';
    if (s !== tm.textContent) { tm.textContent = s; tm.className = 'tm' + (!s ? '' : r.left <= 30 ? ' crit' : r.left <= 60 ? ' warn' : ''); }
  }
  if (key === G.key) return true;
  const ul = box.querySelector('ul'), before = G.key ? G.key.split('#')[0].split('|') : [];
  G.key = key;
  ul.textContent = '';
  f.rows.forEach((g, i) => {
    const li = document.createElement('li');
    li.className = g.done ? 'done' : g.fail ? 'fail' : i === f.now ? 'now' : '';
    // 今まで済んでいなかった物が済んだ時だけ弾ませる
    if (g.done && before[i] && before[i][0] !== '1' && !still) li.classList.add('pop');
    li.innerHTML = '<i aria-hidden="true"></i><span></span>';
    li.lastChild.textContent = `${i + 1}　${g.text}`;   // 番号（kaito 11/3 AV16）
    if (g.count && !g.done) {   // 敵の隊は赤い字・倒した数が一人ごとに上がる（kaito 11/3 AV16）
      const em = document.createElement('em'); em.textContent = `（${g.count[0]}／${g.count[1]}）`; em.style.cssText = 'color:#ff6a58;font-weight:800'; li.appendChild(em);
      li.lastChild.previousSibling.style.color = '#ff8a78';
    }
    li.setAttribute('aria-label', (g.done ? '済み：' : g.fail ? '果たせなかった：' : 'まだ：') + g.text + (g.count ? ` ${g.count[1]}のうち${g.count[0]}` : ''));
    if (g.left != null) { const t = document.createElement('em'); t.className = 'tm'; t.textContent = clock(g.left); li.appendChild(t); }
    ul.appendChild(li);
  });
  return true;
}
