// 対戦の勝ち負けを分かりやすく（kaito 11/22「対戦の勝ち負けが分かりづらい。敗走とかも」・iMac の長の頼み）
//   ①決着の瞬間：画面の真ん中に大きく「勝利」「敗北」「引き分け」と訳の一行（敵本陣陥落・敵全軍潰走・時間切れの判定…）。
//     その前の数秒（match.js の M.ending）は、負けた側の隊の旗が倒れ、兵が背を向けて逃げる（routShow）
//   ②隊の敗走：その隊の旗が倒れ（旗持ちの旗が後ろへ傾く）、上の真ん中に短く「山県昌景隊 敗走」（match.js の戦況の一行の知らせ）。
//     下の武将の札は赤く「潰走」（match_hud.js）
//   ③どちらが勝ちに近いか：上のゲージの下に、自軍と敵の本陣の守りの残り（HQ_INTEGRITY）を五つの目で小さく
//   DOM の札だけ・描く回数は増やさない。試合の画面を片付ける時に一緒に消す
import { isEn, tr } from '../i18n.js';
import { verdictLine } from '../pvp_rules.js';   // K641 ②

const EN = (ja, en) => (isEn() ? en : ja);
const CSS = `
.kmk-v{position:fixed;left:50%;top:38%;transform:translate(-50%,-50%) scale(.92);z-index:60;pointer-events:none;text-align:center;opacity:0;transition:opacity .35s,transform .35s;font-family:"Noto Serif JP","Hiragino Mincho ProN",serif}
.kmk-v.on{opacity:1;transform:translate(-50%,-50%) scale(1)}
.kmk-v b{display:block;font-size:76px;line-height:1.05;font-weight:900;letter-spacing:.18em;padding-left:.18em;color:#f6e7b8;text-shadow:0 0 4px #000,0 0 14px #000,0 3px 0 #5a3c12}
.kmk-v.lose b{color:#e9e2d6;text-shadow:0 0 4px #000,0 0 14px #000,0 3px 0 #4a1410}
.kmk-v.draw b{color:#e9e2d6}
.kmk-v i{display:inline-block;margin-top:10px;padding:5px 18px;border-radius:6px;font-style:normal;font-size:20px;font-weight:700;letter-spacing:.1em;color:#fff4e0;background:rgba(14,11,8,.78);border:1.5px solid #e8d9b0aa}
.kmk-v.win i{border-color:#e8c25a}
.kmk-v.lose i{border-color:#e0503a}
.kmk-v::before{content:"";position:absolute;left:50%;top:50%;width:150vw;height:190px;transform:translate(-50%,-58%);z-index:-1;background:linear-gradient(90deg,transparent,rgba(10,8,6,.62) 25%,rgba(10,8,6,.62) 75%,transparent)}
.kmk-hq{position:fixed;left:50%;top:41px;transform:translateX(-50%);width:min(460px,50vw);display:flex;justify-content:space-between;z-index:41;pointer-events:none;font:700 12px/1 "Noto Serif JP",serif;color:#f4ecd8;text-shadow:0 0 3px #000,0 0 6px #000}
.kmk-hq .s{display:flex;align-items:center;gap:3px}
.kmk-hq .s em{font-style:normal;margin:0 4px}
.kmk-hq .p{width:12px;height:8px;border-radius:2px;border:1px solid #fff6;background:#0008}
.kmk-hq .a .p.on{background:#5aa6ff}
.kmk-hq .f .p.on{background:#e0443a}
.kmk-hq .s.bad .p.on{background:#ffb35a}
@media (max-width:700px){.kmk-v b{font-size:60px}.kmk-v i{font-size:17px}}
@media (prefers-reduced-motion:reduce){.kmk-v{transition:none}}
`;
const css = () => { if (typeof document === 'undefined' || document.getElementById('kmk-css')) return; const s = document.createElement('style'); s.id = 'kmk-css'; s.textContent = CSS; document.head.appendChild(s); };
const LEAD = { strength: ['兵力', 'strength'], morale: ['士気', 'morale'], honjin: ['本陣の守り', 'HQ'], front: ['戦線', 'the front'], generals: ['武将', 'generals'] };

// 訳の一行（自分＝team 0 から見て）
export function verdictText(r) {
  const win = r.winner === 0, lose = r.winner === 1, L = LEAD[r.lead];
  // K641 ②：訳の一行は pvp_rules.verdictLine（総大将の討死・本陣・総崩れ・時間切れの討たれた兵の数）
  if (['taisho', 'honjin', 'rout', 'surrender', 'time', 'draw'].includes(r.why)) return { big: r.winner == null ? EN('引き分け', 'DRAW') : win ? EN('勝利', 'VICTORY') : EN('敗北', 'DEFEAT'), why: verdictLine(r, isEn()), cls: r.winner == null ? 'draw' : win ? 'win' : 'lose' };
  const why = {
    honjin: win ? ['敵本陣陥落', 'Enemy HQ has fallen'] : ['自軍の本陣が陥落', 'Your HQ has fallen'],
    rout: win ? ['敵全軍潰走', 'The enemy army is routed'] : ['自軍が総崩れ', 'Your army is routed'],
    taisho: win ? ['敵の武将を皆討ち取った', 'All enemy generals are down'] : ['自軍の武将が皆討たれた', 'All your generals are down'],
    surrender: win ? ['敵が降伏した', 'The enemy surrendered'] : ['降伏した', 'You surrendered'],
    time: L ? (win ? [`時間切れの判定・${L[0]}で上回った`, `Time up: ahead on ${L[1]}`] : [`時間切れの判定・${L[0]}で下回った`, `Time up: behind on ${L[1]}`]) : ['時間切れの判定', 'Time up'],
    draw: ['時間切れ・互角', 'Time up: even'],
  }[r.why] || (win ? ['勝ち', 'Win'] : lose ? ['負け', 'Loss'] : ['引き分け', 'Draw']);
  return { big: r.winner == null ? EN('引き分け', 'DRAW') : win ? EN('勝利', 'VICTORY') : EN('敗北', 'DEFEAT'), why: EN(why[0], why[1]), cls: r.winner == null ? 'draw' : win ? 'win' : 'lose' };
}

let vEl = null, hqEl = null;
function hook(rt) {
  if (rt._kmkHook) return; rt._kmkHook = 1;
  const d0 = rt.dispose.bind(rt); rt.dispose = (...a) => { kmkDispose(); return d0(...a); };
}
export function kmkDispose() { vEl?.remove(); vEl = null; hqEl?.remove(); hqEl = null; }

// ①決着の札（一度だけ。M.ending の始めか、締めの時）
export function verdictShow(rt, M, r) {
  if (typeof document === 'undefined' || M._kmkShown || !r) return;
  M._kmkShown = true; css(); hook(rt);
  const v = verdictText(r);
  vEl?.remove(); vEl = document.createElement('div'); vEl.id = 'online-verdict'; vEl.className = `kmk-v ${v.cls}`; vEl.setAttribute('role', 'alert');
  const b = document.createElement('b'); b.textContent = v.big; const i = document.createElement('i'); i.textContent = v.why;
  vEl.append(b, i); document.body.appendChild(vEl);
  requestAnimationFrame(() => vEl?.classList.add('on'));
  if (hqEl) hqEl.style.display = 'none';
}

// ②敗走の見せ：旗持ちの旗を後ろへ倒していく（毎コマ少しずつ・旗は使い回し）。end＝決着の見せ（本物の組も背を向けて逃がす）
export function routShow(rt, S, end = false) {
  const g = S?.b?.real; if (!g) return;
  S._kmkFlag = true;
  if (end && !g.routed) {
    g.routed = true; g.order = 'flee';
    const c = g.center(), f = g.forward(); g.fleeDir = { x: -f.x, z: -f.z };
    for (const u of g.units) if (u.alive && !u.isPlayer) { u.fleeing = true; u.target = null; void c; }
  }
}
export function flagTick(rt, M, dt) {
  for (const S of M.sonae || []) {
    if (!S._kmkFlag) continue;
    const g = S.b?.real; if (!g) continue;
    const up = S.state !== '敗走' && !S.forceRout && !g.routed && !M.ending;
    for (const u of g.units) {
      if (!u.flag || !(u.banner || u.stdHeld || u.isStandard)) continue;
      const want = up ? 0 : 1.25;
      const k = u._kmkTilt ?? 0, n = k + (want - k) * Math.min(1, dt * 2.2);
      if (Math.abs(n - k) < 1e-3 && Math.abs(n - want) < 1e-3) continue;
      u._kmkTilt = n; u.flag.rotation.x = -n;
    }
    if (S.state !== '敗走' && !S.forceRout && !g.routed && !M.ending && !g.units.some((u) => (u._kmkTilt ?? 0) > 0.01)) S._kmkFlag = false;
  }
}

// ③両本陣の守りの残り（五つの目）。M.hq[team].v（0〜100）
export function hqTick(rt, M) {
  if (typeof document === 'undefined' || M.over || M.ending) return;
  css(); hook(rt);
  if (!hqEl) {
    hqEl = document.createElement('div'); hqEl.className = 'kmk-hq'; hqEl.id = 'online-hq-left';
    hqEl.setAttribute('aria-label', EN('本陣の守りの残り', 'HQ strength'));
    for (const side of ['a', 'f']) {
      const s = document.createElement('div'); s.className = `s ${side}`;
      const em = document.createElement('em'); em.textContent = EN(side === 'a' ? '本陣' : '敵本陣', side === 'a' ? 'HQ' : 'Foe HQ');
      const pips = []; for (let i = 0; i < 5; i++) { const p = document.createElement('span'); p.className = 'p'; pips.push(p); }
      if (side === 'a') s.append(em, ...pips); else s.append(...pips.slice().reverse(), em);
      s._pips = pips; hqEl.appendChild(s);
    }
    document.body.appendChild(hqEl);
  }
  const [A, F] = hqEl.children;
  for (const [el, team] of [[A, 0], [F, 1]]) {
    const q = M.hq?.[team]; if (!q || q.v == null) continue;
    const n = Math.max(0, Math.min(5, Math.ceil(q.v / 20))), key = `${n}|${q.state}`;
    if (el._k === key) continue; el._k = key;
    el._pips.forEach((p, i) => p.classList.toggle('on', i < n));
    el.classList.toggle('bad', q.state === 'UNDER_ATTACK' || q.state === 'COLLAPSING');
  }
  hqEl.style.display = M.hud?.big?.classList.contains('on') ? 'none' : '';
}

// ②の知らせの字（match.js の戦況の一行が使う）
export const routWord = (S) => { const n = isEn() ? tr(S.taisho || '') : (S.taisho || ''); return S.team ? EN(`敵 ${n}隊 敗走`, `Enemy ${n} routed`) : EN(`${n}隊 敗走`, `${n} routed`); };
