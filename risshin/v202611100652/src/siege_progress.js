// siege_progress.js … 城攻めの進み具合（docs/inabayama_spec_1109.md「城攻めの進み具合を右上に」・kaito 11/9 夜）
// 右上の任務の札のすぐ下に、曲輪の名を一列に並べる：済んだ所は ✓・今いる所は金の丸・まだ先は薄く。
//   例：山麓 ✓／第一曲輪 ✓／中腹曲輪 ●／上部曲輪／本丸
// 字は短く、色と印を先に（済＝✓、今＝金の丸と太字）。稲葉山を原型に、小谷・山中城などの城攻めでも同じ形で使う。
// 使い方（戦の定義の setup から一度）：siegeProgress(rt, ['山麓', '第一曲輪', '中腹曲輪', '上部曲輪', '本丸'], (rt) => 今の番号)
//   今の番号が名の数以上なら全部 ✓（落城）。戦が終われば消える。描かない時（norender・document 無し）は何もしない。
const CSS = `#sg-prog{position:fixed;z-index:6;right:calc(12px + env(safe-area-inset-right,0px));pointer-events:none;display:flex;flex-wrap:wrap;justify-content:flex-end;gap:3px 4px;max-width:min(390px,44vw);font:600 12px/1.25 serif;color:#cfc8b8}
#sg-prog span{background:rgba(14,12,10,.7);border-radius:4px;padding:3px 6px;white-space:nowrap}
#sg-prog span.done{color:#b8c9a2}
#sg-prog span.done::after{content:' ✓'}
#sg-prog span.now{color:#fff;background:rgba(120,92,30,.85);box-shadow:0 0 0 1px #e3c675 inset}
#sg-prog span.now::before{content:'● ';color:#f3d98a}
#sg-prog span.later{opacity:.62}
body.rm #sg-prog span.now{box-shadow:none}`;

export function siegeProgress(rt, names, at) {
  if (typeof document === 'undefined' || !names || !names.length) return null;
  if (typeof window !== 'undefined' && (window.__norender === true || /[?&]norender/.test(location.search))) return null;
  if (!document.getElementById('sg-prog-css')) {
    const st = document.createElement('style'); st.id = 'sg-prog-css'; st.textContent = CSS; document.head.appendChild(st);
  }
  document.getElementById('sg-prog')?.remove();
  const el = document.createElement('div');
  el.id = 'sg-prog';
  el.setAttribute('role', 'status');
  el.innerHTML = names.map((n) => `<span>${String(n).replace(/[&<>"]/g, '')}</span>`).join('');
  document.body.appendChild(el);
  const spans = [...el.children];
  let last = -2;
  const tick = () => {
    if (rt.ended || !el.isConnected) { el.remove(); return; }
    let k = 0;
    try { k = Math.max(0, Math.floor(at(rt) || 0)); } catch (e) { k = last < 0 ? 0 : last; }
    if (k !== last) {
      last = k;
      spans.forEach((s, i) => { s.className = i < k ? 'done' : i === k ? 'now' : 'later'; });
      el.setAttribute('aria-label', `城攻めの進み具合。${names.map((n, i) => `${n}${i < k ? '済み' : i === k ? '今ここ' : ''}`).join('、')}`);
    }
    // 任務の札（#h-prog）の下へ付ける。札が無い・隠れている時は右上の端
    const card = document.getElementById('h-prog');
    const r = card && card.offsetParent ? card.getBoundingClientRect() : null;
    el.style.top = `${Math.round(r && r.height ? r.bottom + 4 : 12)}px`;
    el.hidden = !!(document.getElementById('hud')?.hidden);
    rt.after(0.5, tick);
  };
  tick();
  return el;
}
