// ======================================================================
// P4 チェックポイントの部品（K410・kaito 11/20「浅瀬や陣まで退いたのにクリアにならない。終わりが無いように感じる。
//   ピンの所に着いたらそこがクリアになり、次のピンが出る」）。
//   進む段・退く段を、行き先のピンの連なりにする。今のピンに着いたら、その場で「済」の印（字なし：緑の丸に✓が開いて消える）と
//   音（太鼓一打と目標の音）を出し、次のピンへ進む。ピンそのものは今までの行き先の▼（missionPin）をそのまま使う。
// 使い方：
//   cpStart(rt, [{ x, z, r, label, ready?(rt), onReach?(rt) }, ...])   … 段の始めに一度
//   cpTick(rt)                                                        … 戦の update で毎回（着いたら印と音・onReach・次へ）
//   cpPin(rt)                                                         … missionPin から。今のピン {x,z,r,label} か null
//   cpDone(rt)                                                        … 全部に着いたか
//   ready が偽の間は、そのピンを出さず着いても数えない（例：殿の下知が出るまで南の岸のピンを出さない）。
// ======================================================================
import { sfx } from './audio.js';
import { reduceMotion } from './settings.js';

const P = { x: 0, z: 0, r: 8, label: '' };

export function cpStart(rt, pts) {
  rt.flags.cp = { pts, i: 0, t0: rt.t, reached: [] };
  return rt.flags.cp;
}

export function cpCurrent(rt) {
  const C = rt.flags.cp;
  if (!C || C.i >= C.pts.length) return null;
  const q = C.pts[C.i];
  return q.ready && !q.ready(rt) ? null : q;
}

export function cpPin(rt) {
  const q = cpCurrent(rt);
  if (!q) return null;
  P.x = q.x; P.z = q.z; P.r = q.r ?? 8; P.label = q.label || '';
  return P;
}

export const cpDone = (rt) => !!rt.flags.cp && rt.flags.cp.i >= rt.flags.cp.pts.length;

export function cpTick(rt) {
  const C = rt.flags.cp, u = rt.player?.u;
  if (!C || !u?.alive || rt.over) return false;
  const q = cpCurrent(rt);
  if (!q) return false;
  if (Math.hypot(u.pos.x - q.x, u.pos.z - q.z) >= (q.r ?? 8)) return false;
  C.i++;
  C.reached.push({ k: C.i - 1, t: rt.t });
  cpCue(rt, q);
  q.onReach?.(rt);
  return true;
}

// 戦の側の判定（渡り切り・陣へ入った等）で、k 番目のピンまで済ませる（まだ済んでいない物だけ印と音を一度）
export function cpReach(rt, k) {
  const C = rt.flags.cp;
  if (!C) return;
  let last = null;
  while (C.i <= k && C.i < C.pts.length) { last = C.pts[C.i]; C.reached.push({ k: C.i, t: rt.t }); C.i++; last.onReach?.(rt); }
  if (last) cpCue(rt, last);
}

// 「済」の印：着いた所の上に、緑の丸と✓が開いて一秒半で消える（字は使わない）。音は太鼓一打と目標の音
let el = null;
export function cpCue(rt, q) {
  sfx('taiko', 0.55); sfx('obj', 1.2);
  const root = rt.hud?.root;
  if (!root || typeof document === 'undefined') return;
  if (!el || !el.isConnected) {
    el = document.createElement('div');
    el.id = 'cp-clear';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = '<svg width="96" height="96" viewBox="0 0 96 96"><circle cx="48" cy="48" r="38" fill="#3f7a3a" fill-opacity=".86" stroke="#14120f" stroke-width="5"/><circle cx="48" cy="48" r="38" fill="none" stroke="#e4f2cb" stroke-width="2.5"/><path d="M30 49L43 62L67 35" fill="none" stroke="#14120f" stroke-width="13" stroke-linecap="round" stroke-linejoin="round"/><path d="M30 49L43 62L67 35" fill="none" stroke="#fff3ba" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    el.style.cssText = 'position:absolute;left:50%;top:34%;width:96px;height:96px;margin:-48px 0 0 -48px;pointer-events:none;z-index:4;opacity:0';
    const st = document.createElement('style');
    st.textContent = '@keyframes cpClear{0%{opacity:0;transform:scale(.4)}18%{opacity:1;transform:scale(1.15)}30%{transform:scale(1)}75%{opacity:1}100%{opacity:0;transform:scale(1) translateY(-18px)}}' +
      '#cp-clear.on{animation:cpClear 1.6s ease-out forwards}#cp-clear.still{opacity:1;transition:opacity .4s}' +
      '#hud.photo #cp-clear,#hud.ending #cp-clear{display:none}';
    el.appendChild(st);
    root.appendChild(el);
  }
  // 着いた所（足元の少し上）が画面の内なら、そこに出す。外なら画面の上の三分の一
  let x = 50, y = 34;
  const v = rt.camera?.isCamera ? projected(rt, q) : null;
  // 右上の目標の札・左上の命の棒に重ねない（act bot 874×402 で .gs-tag と重なった）：真ん中の帯に収める
  if (v) { x = Math.max(22, Math.min(78, v.x)); y = Math.max(34, Math.min(66, v.y)); }
  // 目標の札（#h-prog）や行き先の札（.gs-tag）に重ならない所へ：重なる間、札の下端の下へ下げる（戸次川・金ヶ崎 874×402 で重なった）
  try {
    const rr = root.getBoundingClientRect();
    if (rr.height > 0) {
      for (let pass = 0; pass < 3; pass++) for (const sel of ['#h-prog', '.gs-tag', '#jk-map']) {   // 一つを避けて下げた先で別の札に重なる（小地図の下の .gs-tag）ので、三度まで見直す   // 11/20 k365-cloud-42：上の真ん中の小地図（#jk-map）にも重ねない（関ヶ原 874×402 の act bot）
        const t = root.querySelector(sel) || document.querySelector(sel); if (!t) continue;
        const b = t.getBoundingClientRect(); if (b.height <= 0 || b.width <= 0) continue;
        const cx = rr.left + rr.width * x / 100, cy = rr.top + rr.height * y / 100;
        const hit = cx + 54 > b.left && cx - 54 < b.right && cy + 54 > b.top && cy - 54 < b.bottom;
        if (hit) { const ny = ((b.bottom + 74 - rr.top) / rr.height) * 100; if (ny < 88) y = ny; }   // 開く間に十八 px 上へ浮くので、その分も空ける
      }
    }
  } catch (e) { /* 札が無ければそのまま */ }
  el.style.left = x + '%'; el.style.top = y + '%';
  el.classList.remove('on', 'still');
  void el.offsetWidth;   // 続けて着いた時も始めから開く
  if (reduceMotion()) {
    el.classList.add('still');
    clearTimeout(el._t); el._t = setTimeout(() => { el.classList.remove('still'); el.style.opacity = '0'; }, 1400);
  } else { el.style.opacity = ''; el.classList.add('on'); }
}

let V = null;
function projected(rt, q) {
  const u = rt.player.u;
  V = V || u.pos.clone();
  V.set(q.x, (u.pos.y || 0) + 2.4, q.z).project(rt.camera);
  if (V.z > 1 || Math.abs(V.x) > 0.85 || Math.abs(V.y) > 0.8) return null;
  return { x: (V.x + 1) * 50, y: (1 - V.y) * 50 };
}
