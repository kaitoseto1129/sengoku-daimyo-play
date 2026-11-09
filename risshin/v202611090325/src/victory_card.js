import { HIST_OUTCOME, outcomeLines } from './battle_outcome.js';
// 勝った時の大きな札（kaito 11/2 P「合戦に勝利・この戦を攻略をはっきり」「終わった後の待ちを短く」）。
// 戦が決まった瞬間に画面の真ん中へ金の題字を出し、少し後に結果の画面へ進む。押せばすぐ結果へ。
const CSS = `
#victory-card { position:fixed; inset:0; z-index:21; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:10px; cursor:pointer;
  background:radial-gradient(ellipse at 50% 50%, rgba(10,8,6,.62) 0%, rgba(10,8,6,.35) 45%, rgba(10,8,6,0) 75%); animation:vc-in .5s ease-out both; }
#victory-card h2 { margin:0; font-family:"Hiragino Mincho ProN","Yu Mincho","Noto Serif JP",serif; font-weight:800; letter-spacing:.16em; font-size:clamp(40px, 11vh, 84px); line-height:1.1;
  background:linear-gradient(180deg,#fff1c4 0%,#e6bf62 45%,#a87a2c 100%); -webkit-background-clip:text; background-clip:text; color:transparent; filter:drop-shadow(0 3px 4px rgba(0,0,0,.9)); }
#victory-card p { margin:0; padding:6px 22px; font-family:"Hiragino Mincho ProN","Yu Mincho","Noto Serif JP",serif; font-size:clamp(18px, 4.4vh, 28px); font-weight:700; letter-spacing:.2em; color:#fff3e2;
  background:linear-gradient(90deg, rgba(142,42,29,0), rgba(142,42,29,.92) 18%, rgba(142,42,29,.92) 82%, rgba(142,42,29,0)); text-shadow:0 1px 2px #000; animation:vc-in .5s ease-out .5s both; }
@keyframes vc-in { from { opacity:0; transform:scale(1.06); } to { opacity:1; transform:none; } }
body.rm #victory-card, body.rm #victory-card p { animation:none; }
@media (prefers-reduced-motion:reduce) { #victory-card, #victory-card p { animation:none; } }
`;
// 退き口を果たす戦は「勝利」と言わない
export const DUTY = new Set(['kanegasaki', 'mikatagahara', 'honnoji', 'shiga', 'tedorigawa', 'saika', 'k11_sanadamaru', 'sanadamaru', 't06_hetsugi', 't03b_nagakute', 'k05_ueda', 'k04_kuisegawa', 'okawachi']);   // 11/8 critic60：大河内の夜攻めは押し返された戦（城は一月後の和睦で受け取る）。「合戦に勝利」と呼ばない   // 雑賀は川を越えられず和議で終わる・真田丸は寄せ手が撃ち崩されて退く・戸次川は大敗の退き口（勝ちと呼ばない）   // 長久手は羽柴方の大負け（池田・森が討たれる）   // 第二次上田は徳川の先手が押し返されて退いた小競り合い

export function showVictory(rt) {
  if (document.getElementById('victory-card') || rt.def.dojo || rt.def.town) return;
  // 「討ち取ったり」の大きな字が消えてから勝利の札を出す（二つが重ならないように）
  const wait = (rt.flags?.killWordRealUntil || 0) - performance.now();
  if (wait > 0 && !rt._victoryWaiting) {
    rt._victoryWaiting = true;
    setTimeout(() => { rt._victoryWaiting = false; if (!rt.ended) showVictory(rt); }, wait);
    return;
  }
  if (!document.getElementById('victory-style')) {
    const st = document.createElement('style'); st.id = 'victory-style'; st.textContent = CSS; document.head.appendChild(st);
  }
  const el = document.createElement('div');
  el.id = 'victory-card';
  el.setAttribute('role', 'status');
  const F = rt._fall?.F;   // 落城の戦は「勝利」と言わず、城ごとの言葉（castle_fall_data.js）
  el.innerHTML = F ? `<h2>${F.word}</h2>${F.sub ? `<p>${F.sub}</p>` : ''}` : `<h2>${rt.def.victoryTitle || rt.def.winWord || (DUTY.has(rt.def.key) ? '務めを果たした' : '合戦に勝利')}</h2><p>${HIST_OUTCOME[rt.def.key] ? outcomeLines(rt.def.key, true).join('<br>') : rt.def.victoryCaption || (DUTY.has(rt.def.key) ? '生きて戦を終えた' : '敵を退けた')}</p>`;   // 歴史で負ける戦は合戦と任務を分けて（battle_outcome.js）
  el.addEventListener('click', (e) => { e.stopPropagation(); if (rt.over && !rt.ended) rt.endT = Math.min(rt.endT ?? 0.01, 0.01); });
  document.body.appendChild(el);
  const off = () => el.remove();
  rt.cleanupTasks?.add(off);
  setTimeout(off, 12000);
}
