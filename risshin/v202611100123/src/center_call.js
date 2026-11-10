// 起きた出来事を画面の中央に短く大きく出し、すぐ消す（kaito 11/9 遊んだ声 6）。
//   出来事は senkyo.js の logEvent から拾う。ミッションが変わった時は hud_feedback.js の goalChanged から呼び、一瞬青く光らせる。
//   決まり：同じ文は八秒に一度・同時に三つまで・「動きを減らす」では光らせない。
import { onEvent } from './senkyo.js';
import { S } from './settings.js';

const SEEN = new Map();
let box = null;

function css() {
  if (document.getElementById('cc-style')) return;
  const st = document.createElement('style');
  st.id = 'cc-style';
  st.textContent = `
#center-call { position:absolute; left:0; right:0; top:40%; display:flex; flex-direction:column; align-items:center; gap:6px; pointer-events:none; z-index:6; }   /* 11/9 二巡（姉川）：右上の任務の札と進みの棒に重ならないよう、少し下げて幅を詰める */
#center-call .cc { font-family:var(--display, serif); font-weight:800; font-size:max(18px, calc(clamp(22px, 4.4vw, 44px) * var(--text-scale, 1))); letter-spacing:.12em; color:#fff; -webkit-text-stroke:1px rgba(30,6,4,.9); paint-order:stroke fill; text-shadow:0 2px 12px rgba(0,0,0,.85); padding:2px 16px; max-width:64vw; text-align:center; animation:cc-in 2.1s ease-out forwards; }
#center-call .cc.blue { color:#e6f2ff; text-shadow:0 0 14px #4aa8ff, 0 0 30px #2a7de0, 0 2px 12px rgba(0,0,0,.85); animation:cc-in 2.1s ease-out forwards, cc-blue .9s ease-out 1; }
@keyframes cc-in { 0% { opacity:0; transform:scale(1.15); } 12% { opacity:1; transform:none; } 72% { opacity:1; } 100% { opacity:0; } }
@keyframes cc-blue { 0% { filter:brightness(1.8) drop-shadow(0 0 18px #4aa8ff); } 100% { filter:none; } }
body.rm #center-call .cc, html.rm #center-call .cc { animation:none; }
@media (prefers-reduced-motion:reduce) { #center-call .cc { animation:none; } }
body:has(#pause:not([hidden])) #center-call, body:has(#intro:not([hidden])) #center-call { visibility:hidden; }
/* 11/9 二巡（太田城）：中央の大きな字が出ている二秒の間は、行き先の▼の名札を薄く（字が重なって読めなかった） */
body:has(#center-call .cc) #goal-sign .gs-tag { opacity:0; transition:opacity .2s; }
`;
  document.head.appendChild(st);
}

export function centerCall(rt, text, blue = false) {
  const hud = document.getElementById('hud');
  if (!hud || !text || !rt || rt.def?.town || rt.def?.dojo || rt.over) return false;
  const t = rt.t ?? 0, last = SEEN.get(text);
  if (last != null && t >= last && t - last < 8) return false;   // 同じ文は八秒に一度
  if (!box || !box.isConnected) { css(); box = document.createElement('div'); box.id = 'center-call'; box.setAttribute('aria-live', 'polite'); hud.appendChild(box); }
  if (box.children.length >= 3) return false;   // 同時に三つまで
  SEEN.set(text, t);
  const el = document.createElement('div');
  el.className = 'cc' + (blue && !S.reduceMotion ? ' blue' : '');
  el.textContent = text;
  box.appendChild(el);
  const ms = S.reduceMotion ? 1800 : 2150;
  setTimeout(() => el.remove(), ms);
  return true;
}

// ミッションが変わった時：先頭の文だけを大きく出す
export function missionCall(rt, text) {
  let s = String(text || '').split(/[。\n]/)[0].replace(/\s+/g, '');
  if (!s) return false;
  if (s.length > 20) s = s.slice(0, 20);
  return centerCall(rt, s, true);
}

const nameOf = (rt, id) => (rt.sonae || []).find((s) => s.id === id)?.name?.replace(/[（(][^）)]*[）)]/g, '') || '';
onEvent((rt, key, o) => {
  if (!rt || !rt.def || rt.over) return;
  const mine = o.team === rt.player?.u?.team, nm = nameOf(rt, o.who);
  let text = '';
  if (key === 'honjinDanger') text = mine ? '本陣が襲われている' : '敵の本陣へ迫っている';
  else if (key === 'gotsumeArrive') text = nm ? `${nm}、援軍に到着` : (mine ? '味方の援軍が着いた' : '敵の援軍が着いた');
  else if (key === 'pursuit') text = nm ? `${nm}、追撃` : (mine ? '味方が追撃に移った' : '敵が追ってくる');
  else if (key === 'taishoDown') text = mine ? '味方の大将が討たれた' : '敵の大将を討った';
  else if (key === 'armyBroken') text = mine ? '味方が総崩れ' : '敵が総崩れ';
  else if (key === 'flankOpen') text = mine ? '' : '敵が横から回り込む';
  else if (key === 'zoneFall') text = '持ち場が落ちた';
  else if (key === 'lineRestored') text = nm ? `${nm}、立て直した` : '';
  else if (key === 'order' && (o.v === 'charge' || o.v === 'assault' || o.v === 'attack')) text = nm ? `${nm}、突撃` : '';
  if (text) centerCall(rt, text);
});
