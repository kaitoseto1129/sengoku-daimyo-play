// 起きた出来事を画面の中央に短く大きく出し、読む時間を残す（kaito 11/9 遊んだ声 18）。
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
#center-call .cc { background:rgba(18,22,28,.94); border-radius:4px; animation-duration:5s; }
#center-call .cc { box-sizing:border-box; max-width:min(64vw, 100%); overflow-wrap:anywhere; }   /* 箱が釦を避けて狭まった時も、字を箱の外（釦の後ろ）へはみ出させない */
#center-call .cc.blue { color:#e6f2ff; background:rgba(12,39,69,.96); border:1px solid #79b9eb; text-shadow:0 2px 4px #061322; animation:cc-in 5s ease-out forwards, cc-blue .9s ease-out 1; }
/* 田野の五目標は右上に常時ある。知らせは左の細い欄へ置き、目標と重ねない。 */
@media (max-height:500px) {
 html:root body #hud:has(#h-prog[data-battle="tano"]) #center-call {
  left:calc(8px + env(safe-area-inset-left, 0px)); right:auto; top:calc(56px + env(safe-area-inset-top, 0px)); width:30vw;
 }
 html:root body #hud:has(#h-prog[data-battle="tano"]) #center-call .cc {
  box-sizing:border-box; max-width:100%; padding:4px 8px; font-size:max(15px,calc(15px * var(--text-scale,1))); letter-spacing:0; animation:none;
 }
}
@keyframes cc-in { 0% { opacity:0; transform:scale(1.15); } 12% { opacity:1; transform:none; } 72% { opacity:1; } 100% { opacity:0; } }
@keyframes cc-blue { 0% { filter:brightness(1.8) drop-shadow(0 0 18px #4aa8ff); } 100% { filter:none; } }
body.rm #center-call .cc, html.rm #center-call .cc { animation:none; }
@media (prefers-reduced-motion:reduce) { #center-call .cc { animation:none; } }
body:has(#pause:not([hidden])) #center-call, body:has(#intro:not([hidden])) #center-call { visibility:hidden; }
/* 中央の知らせが出ている間は、行き先の名札との重なりを防ぐ。 */
/* 右上の目標の札が五行ほど並ぶ間は、中央の呼び声をその札の左へ寄せる（札と重なって読めなかった。11/10 森部） */
html:root body #hud:has(#h-prog.goals-all-rows) #center-call { right:min(340px, 38vw); }
/* 携帯の横画面（高さ460以下）：大きな字が三行に折れて下の命の棒（#jk-vit）に重なった（11/11 野田・福島・大河内）。字を小さく、上へ寄せ、二行までに収める */
/* 携帯の横画面で右上の目標の札（goal-mode）が四行ほどになると、30% の高さの呼び声と横で重なった（11/11 稲葉山 874×402）。札の左へ寄せる */
@media (max-height:460px) { html:root body #hud:has(#h-prog.goal-mode) #center-call { right:min(340px, 38vw); } }
@media (max-height:460px) { #center-call { top:30%; } #center-call .cc { font-size:max(15px, calc(clamp(16px, 2.6vw, 24px) * var(--text-scale, 1))); letter-spacing:.06em; max-width:min(64vw, 100%); padding-top:4px; padding-bottom:4px; } }
body:has(#center-call .cc) #goal-sign .gs-tag { opacity:0; transition:opacity .2s; }
`;
  document.head.appendChild(st);
}

export function centerCall(rt, text, blue = false) {
  const hud = document.getElementById('hud');
  if (!hud || !text || !rt || rt.def?.town || rt.def?.dojo || rt.def?.quietCenterCalls || rt.over) return false;
  // 任務の全文は右上の五行にある。切り詰めた同じ任務を中央へ重ねない。
  if (rt.def?.key === 'tano' && (blue || box?.isConnected && box.children.length)) return false;
  const t = rt.t ?? 0, last = SEEN.get(text);
  // 同じ文は八秒に一度。出来事（青でない札）は三十秒に一度（11/13 姉川：「敵が横から回り込む」が十秒ごとに五回出た）
  if (last != null && t >= last && t - last < (blue ? 8 : 30)) return false;
  if (!box || !box.isConnected) { css(); box = document.createElement('div'); box.id = 'center-call'; box.setAttribute('aria-live', 'polite'); hud.appendChild(box); }
  if (box.children.length >= 3) return false;   // 同時に三つまで
  SEEN.set(text, t);
  const el = document.createElement('div');
  el.className = 'cc' + (blue ? ' blue' : '');
  if (S.reduceMotion) el.style.animation = 'none';
  el.textContent = text;
  box.appendChild(el);
  clearLeftButtons(box);
  setTimeout(() => el.remove(), 5000);
  return true;
}

// 11/13 司令塔の気づき（K217 の行）：右上の札を避けて左へ寄ると、左上の釦（保存・止める・設定・視点。z 30）の後ろに知らせの頭が潜って読めなかった。
//   釦が知らせの高さにある時は、知らせの箱の左の端を釦の右へ寄せる
const LEFT_BTNS = '#side-ctl:not([hidden]) .side-btn, #tc-pause, #tc-view, #tc-sound, #tc-set';
function clearLeftButtons(b) {
  b.style.left = '';
  const r = b.getBoundingClientRect(), top = r.top, bottom = Math.max(r.bottom, top + 60);
  let edge = 0;
  for (const el of document.querySelectorAll(LEFT_BTNS)) {
    if (el.hidden || el.offsetParent === null) continue;
    const q = el.getBoundingClientRect();
    if (q.width < 2 || q.left > innerWidth * 0.4 || q.bottom < top - 4 || q.top > bottom + 4) continue;
    edge = Math.max(edge, q.right);
  }
  if (edge > r.left - 8) b.style.left = Math.round(edge + 8) + 'px';
}

// 時が飛ぶ所（暗転・「――二日後」など）：少し置いて、今の目標を画面の真ん中に短く出す（kaito 11/3 AT7 K183）。
//   字は右上の今の目標の一行から取る（同じ文の八秒あけ・三つまでの決まりは centerCall のまま）
export function timeSkipGoal(rt, delay = 3) {
  const go = () => {
    if (!rt || rt.over) return;
    const el = document.querySelector('#h-prog .pg-goals li.now span') || document.querySelector('#h-prog .pg-st > span:last-child');
    let t = (el?.textContent || '').replace(/[\u200b\u00ad]/g, '').replace(/^[0-9０-９①-⑳]+[／\/0-9０-９]*[　\s]*/, '').replace(/（[^）]*）$/, '').trim();
    if (!t) t = (rt.objectives || []).find((o) => o && o.kind === 'main' && !o.state)?.text || '';
    if (t) missionCall(rt, t);
  };
  if (rt?.after) rt.after(delay, go); else setTimeout(go, delay * 1000);
}

// ミッションが変わった時：先頭の文だけを大きく出す
export function missionCall(rt, text) {
  let s = String(text || '').split(/[。\n]/)[0].replace(/\s+/g, '');
  if (!s) return false;
  if (s.length > 20) s = s.slice(0, 20);
  return centerCall(rt, s, true);
}

let PURSUIT_AT = null;
const nameOf = (rt, id) => (rt.sonae || []).find((s) => s.id === id)?.name?.replace(/[（(][^）)]*[）)]/g, '') || '';
onEvent((rt, key, o) => {
  if (!rt || !rt.def || rt.over) return;
  const mine = o.team === rt.player?.u?.team, nm = nameOf(rt, o.who);
  let text = '';
  if (key === 'honjinDanger') text = mine ? '本陣が襲われている' : '敵の本陣へ迫っている';
  else if (key === 'gotsumeArrive') text = nm ? `${nm}、援軍に到着` : (mine ? '味方の援軍が着いた' : '敵の援軍が着いた');
  else if (key === 'pursuit') {
    // 追撃は複数の備が同じ時に動く。中央へ三行重ねず、二十秒に一度だけ短く出す（11/10 森部・墨俣：「柴田勝家の先手、追撃」が三行並んだ）
    const now = rt.t ?? 0;
    if (PURSUIT_AT != null && now >= PURSUIT_AT && now - PURSUIT_AT < 20) return;
    PURSUIT_AT = now;
    text = mine ? '味方が追撃に移った' : '敵が追ってくる';
  }
  else if (key === 'taishoDown') {
    // 八王子では曲輪の将の討死を、城全体の大将を自分で討った知らせと混同させない。
    // 討死の記録にある名を使い、無名の組頭も大将とは呼ばない。
    if (rt.def.key === 't11_hachioji' || rt.def.key === 'nodafukushima') text = o.v ? `${o.v}、討死` : `${mine ? '味方' : '敵'}の組頭が討たれた`;
    else text = mine ? '味方の大将が討たれた' : '敵の大将を討った';
  }
  // 真田丸では、退きの下知前も寄せ手の崩れを全軍の壊滅と取り違えない。
  else if (key === 'armyBroken') text = mine && (rt.def.key === 'k11_sanadamaru' || rt.def.key === 'sanadamaru') ? (rt.flags?.retreatOrder ? '寄せ手が撤収する' : '寄せ手が崩れた') : mine ? '味方が総崩れ' : '敵が総崩れ';
  else if (key === 'flankOpen') text = mine ? '' : '敵が横から回り込む';
  else if (key === 'zoneFall') text = '持ち場が落ちた';
  else if (key === 'lineRestored') text = nm ? `${nm}、立て直した` : '';
  else if (key === 'order' && (o.v === 'charge' || o.v === 'assault' || o.v === 'attack')) text = nm ? `${nm}、突撃` : '';
  if (text) centerCall(rt, text);
});
