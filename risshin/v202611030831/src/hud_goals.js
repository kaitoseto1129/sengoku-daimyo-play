// 右上の「目標」の札（kaito 11/1 の手本 docs/kaito_mission_ref_1101.png・B 節）
//   暗い半透明の下地に白い字。見出し「目標」の下に、今の段の目標を四角の印付きで三つほど並べ、済んだ物に ✓ を入れる。
//   右上には今の段だけを出す。段の変わり方は世の中のゲームに合わせる：
//     済んだ目標は印が弾んで ✓ が入り、字が少し沈む → 段の全部が済むと一拍（1.6 秒）そのまま見せる
//     → 札が右へ滑って消え、次の段の目標が右から滑り込み、見出しが一度だけ金に光る。
//   「動きを減らす」の時は滑りと光を止め、すぐ入れ替える。
//   段と目標の中身は stages.js（STAGES の三つ目の欄）。字が変わる時だけ書く。毎コマ作らない。
import { S } from './settings.js';

const HOLD = 1.6, OUT = 0.28;
const CSS = `
html:root body #hud #h-prog.goal-mode.goal-mode { padding:10px 16px 12px 14px; background:rgba(14,12,10,.62); border:none; border-radius:6px;
 box-shadow:0 2px 10px rgba(0,0,0,.35); width:max-content; min-width:220px; max-width:min(360px, calc(100vw - 140px)); animation:none; transform:none; }
html:root body #hud#hud #h-prog.goal-mode > :not(.pg-goals) { display:none !important; }
html:root body #hud#hud #h-prog.goal-mode > .pg-goals { display:block !important; }
#hud #h-prog .pg-goals { display:none; color:#fff; text-align:left; text-shadow:0 1px 2px rgba(0,0,0,.8); }
#hud #h-prog.goal-mode .pg-goals { display:block; }
#hud #h-prog .pg-goals h3 { margin:0 0 6px; font-size:max(17px, calc(17px * var(--text-scale, 1))); font-weight:700; letter-spacing:.08em; color:#fff; line-height:1.3; }
#hud #h-prog .pg-goals ul { list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:6px; }
#hud #h-prog .pg-goals li { display:flex; align-items:center; gap:10px; font-size:max(16px, calc(16px * var(--text-scale, 1))); line-height:1.35; white-space:nowrap; }
#hud #h-prog .pg-goals li i { flex:none; position:relative; width:16px; height:16px; border:2px solid #f3efe6; border-radius:2px; box-sizing:border-box; }
#hud #h-prog .pg-goals li.done i::after { content:""; position:absolute; left:3px; top:-5px; width:6px; height:13px; border:solid #9fe08a; border-width:0 3px 3px 0; transform:rotate(40deg); }
#hud #h-prog .pg-goals li.done span { color:#d9d4c8; }
#hud #h-prog .pg-goals li.pop i { animation:goal-pop .45s ease-out 1; }
@keyframes goal-pop { 0% { transform:scale(1); } 40% { transform:scale(1.45); } 100% { transform:scale(1); } }
#hud #h-prog .pg-goals.out { transition:transform ${OUT}s ease-in, opacity ${OUT}s ease-in; transform:translateX(40px); opacity:0; }
#hud #h-prog .pg-goals.in { animation:goal-in .35s ease-out 1; }
#hud #h-prog .pg-goals.in h3 { animation:goal-head 1.2s ease-out 1; }
@keyframes goal-in { 0% { transform:translateX(40px); opacity:0; } 100% { transform:none; opacity:1; } }
@keyframes goal-head { 0%,100% { color:#fff; } 30% { color:#f2cf6a; } }
body.rm #hud #h-prog .pg-goals, body.rm #hud #h-prog .pg-goals * { animation:none !important; transition:none !important; }
@media (prefers-reduced-motion:reduce) { #hud #h-prog .pg-goals, #hud #h-prog .pg-goals * { animation:none !important; transition:none !important; } }
#hud #h-prog .pg-seg { display:flex; gap:3px; margin-top:8px; }
#hud #h-prog .pg-seg[hidden] { display:none; }
#hud #h-prog .pg-seg i { flex:1; height:5px; background:rgba(243,239,230,.18); border-radius:1px; }
#hud #h-prog .pg-seg i.on { background:linear-gradient(180deg,#f2d78a,#b8913f); }
#hud #h-prog .pg-seg i.now { background:rgba(216,178,90,.35); box-shadow:inset 0 0 0 1px #d9b45a; }
@media (max-height:500px) {
 #hud #h-prog .pg-seg { margin-top:6px; }
 html:root body #hud #h-prog.goal-mode.goal-mode { padding:7px 12px 9px 10px; min-width:180px; }
 #hud #h-prog .pg-goals h3 { font-size:15px; margin-bottom:4px; }
 #hud #h-prog .pg-goals ul { gap:4px; }
 #hud #h-prog .pg-goals li { font-size:15px; gap:8px; }
 #hud #h-prog .pg-goals li i { width:14px; height:14px; }
 #hud #h-prog .pg-goals li.done i::after { left:2px; top:-5px; width:5px; height:12px; }
}`;

let styled = false;
// el：右上の任務の札（#h-prog）。stg：stageNow の返す物（goals 付き）。札を出したら true
export function goalsTick(el, rt, stg) {
  const on = !!(stg && stg.goals && stg.goals.length && !rt.over);
  el.classList.toggle('goal-mode', on);
  if (!on) return false;
  if (!styled) { styled = true; const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st); }
  let box = el.querySelector('.pg-goals');
  if (!box) {
    box = document.createElement('div'); box.className = 'pg-goals';
    box.innerHTML = '<h3>目標</h3><ul></ul><div class="pg-seg" aria-hidden="true"></div>';
    el.appendChild(box);
  }
  const G = el._goals && el._goals.rt === rt ? el._goals : (el._goals = { rt, shown: -1, key: '', next: -1, at: 0, list: null, done: [] });
  const still = !!S.reduceMotion;
  // 段が変わった：前の段を ✓ のまま一拍見せてから入れ替える
  if (G.shown < 0) { G.shown = stg.i; G.list = stg.goals; }
  else if (stg.i !== G.shown && G.next !== stg.i) { G.next = stg.i; G.at = rt.t + (still ? 0 : HOLD); for (const g of G.list) g.done = true; }
  if (G.next >= 0) {
    if (rt.t >= G.at + (still ? 0 : OUT)) {
      G.shown = G.next; G.next = -1; G.list = stg.goals; G.key = '';
      box.classList.remove('out');
      if (!still) { box.classList.remove('in'); void box.offsetWidth; box.classList.add('in'); }
    } else if (rt.t >= G.at && !still) box.classList.add('out');
  } else G.list = stg.goals;
  const list = G.list;
  const key = list.map((g) => (g.done ? '1' : '0') + g.text).join('|') + '#' + G.shown + '/' + (stg.n || 0);
  if (key === G.key) return true;
  const ul = box.querySelector('ul'), before = G.key ? G.key.split('#')[0].split('|') : [];
  G.key = key;
  ul.textContent = '';
  list.forEach((g, i) => {
    const li = document.createElement('li');
    li.className = g.done ? 'done' : '';
    // 今まで済んでいなかった物が済んだ時だけ弾ませる
    if (g.done && before[i] && before[i][0] === '0' && !still) li.classList.add('pop');
    li.innerHTML = '<i aria-hidden="true"></i><span></span>';
    li.lastChild.textContent = g.text;
    li.setAttribute('aria-label', (g.done ? '済み：' : 'まだ：') + g.text);
    ul.appendChild(li);
  });
  // 戦の進み（kaito 11/1 J の「進行率」の金の棒）：段の数だけ区切り、済んだ段は金・今の段は金の縁・先は暗い。字は出さない
  const seg = box.querySelector('.pg-seg');
  if (seg) {
    const n = stg.n || 0;
    seg.hidden = n < 2;
    seg.innerHTML = n < 2 ? '' : Array.from({ length: n }, (_, k) => `<i class="${k < G.shown ? 'on' : k === G.shown ? 'now' : ''}"></i>`).join('');
  }
  return true;
}
