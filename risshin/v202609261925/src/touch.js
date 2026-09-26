// 触る操作（携帯・iPad）
// 左の親指：触れた所に出る浮かぶ棒で歩く（端の外まで倒すと走る）
// 右側をなぞる：視点。右下の丸：突く（押し続けて溜め突き）・構える・回避・号令の輪・鼓舞・狙い・持ち替え・乗り降り・取る
// 左上：一時停止と戦術地図。PC（触らない端末）では何も出さない
import { S } from './settings.js';

// 触る端末か（指で触れる画面があり、主な指し物が指）
export const isTouch = typeof window !== 'undefined' && matchMedia('(pointer: coarse)').matches && ('ontouchstart' in window || navigator.maxTouchPoints > 0);
// 携帯か（短い辺が 600px 未満）
const isPhone = isTouch && Math.min(screen.width, screen.height) < 600;

// 画質の既定：触る端末は携帯「低」・iPad「中」。自分で画質を選んで保存してあれば、そのまま
if (isTouch) {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem('sengoku-risshin-settings-v1') || 'null'); } catch (e) { /* 読めない */ }
  if (!saved || !saved.quality) S.quality = isPhone ? 'low' : 'mid';
}

const CSS = `
/* 触る端末だけ：ページの拡大・端の戻る・長押しの選択を止める */
html.touch, html.touch body { overscroll-behavior: none; touch-action: manipulation; -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; -webkit-tap-highlight-color: transparent; }
html.touch input, html.touch textarea { -webkit-user-select: text; user-select: text; }
html.touch canvas#view { touch-action: none; }
/* 横向きの安全な余白（切り欠き・下の帯） */
html.touch #screen { padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); }
html.touch .tl { left: calc(76px + env(safe-area-inset-left, 0px)); }
html.touch .bl { left: calc(16px + env(safe-area-inset-left, 0px)); }
html.touch .tr { right: calc(16px + env(safe-area-inset-right, 0px)); }
html.touch .toastbox { right: calc(20px + env(safe-area-inset-right, 0px)); }
/* 下の早見の帯は丸の釦と同じことをするので、触る端末では隠す */
html.touch #h-bottom { display: none !important; }
/* 号令の顔の札は、右下の丸と重ならないよう下の真ん中へ */
html.touch #h-units { right: auto; left: 50%; transform: translateX(-50%); bottom: calc(10px + env(safe-area-inset-bottom, 0px)); max-width: 34vw; justify-content: center; }
/* 小地図は押すと戦術地図が開く */
html.touch #minimap { pointer-events: auto; }
html.touch #choice .opt, html.touch #skiphint, html.touch #prompt { pointer-events: auto; cursor: pointer; }
/* 字幕を押すと会話の記録。記録を押すと閉じる */
html.touch #subtitle:not(:empty), html.touch #sublog { pointer-events: auto; cursor: pointer; }
/* 飛ばせる場面の札は、右下の丸と重ならないよう上の真ん中へ。キーの字は出さず、札そのものを押す */
html.touch #hud #skiphint { right: auto; left: 50%; transform: translateX(-50%); bottom: auto !important; top: calc(108px + env(safe-area-inset-top, 0px)) !important; height: auto; min-height: 44px; box-sizing: border-box; display: flex; align-items: center; }
html.touch #skiphint kbd { display: none; }
html.touch #skiphint::before { content: '押して：'; color: var(--kin); margin-right: 4px; }
html.touch #prompt kbd { display: none; }
html.touch #prompt::before { content: '押して：'; color: var(--kin); }
/* 高さの低い画面（携帯の横向き） */
@media (max-height: 500px) {
  html.touch .wrap { padding-block: 16px; }
  html.touch h1.title { font-size: clamp(36px, 8vh, 56px); margin: 4px 0 2px; }
  html.touch .lead { font-size: 13px; line-height: 1.7; }
  html.touch .ill-title { max-height: 30vh; }
  html.touch .title-act { padding-top: 8px; padding-bottom: calc(8px + env(safe-area-inset-bottom, 0px)); }
  html.touch #hud { font-size: 12px; }
  html.touch .tr { width: 190px; gap: 6px; top: calc(8px + env(safe-area-inset-top, 0px)); }
  html.touch #minimap { width: 80px; height: 80px; }
  html.touch #objectives { padding: 6px 10px; font-size: 12px; max-height: 22vh; overflow: hidden; }
  html.touch #objectives h4 { margin: 0 0 2px; font-size: 12px; }
  html.touch #dateline { display: none; }
  html.touch .tl { top: calc(8px + env(safe-area-inset-top, 0px)); }
  html.touch .bl { width: 220px; padding: 5px 10px 6px; gap: 3px; bottom: calc(8px + env(safe-area-inset-bottom, 0px)); }
  html.touch #compass { top: calc(44px + env(safe-area-inset-top, 0px)); width: min(360px, 44vw); }
  html.touch #armybar { width: min(460px, 52vw); top: calc(6px + env(safe-area-inset-top, 0px)); }
  /* 字幕と声は、左の棒・体力の札と右下の丸の間に（丸に重ねない） */
  html.touch #subtitle { font-size: 14px; bottom: calc(64px + env(safe-area-inset-bottom, 0px)); left: calc(50% - 24px); transform: translateX(-50%); max-width: min(44vw, 380px); }
  html.touch #bark { left: calc(50% - 24px); transform: translateX(-50%); max-width: min(44vw, 380px); }
  html.touch #radial { transform: scale(.76); }
  html.touch #h-units { max-width: 30vw; }
  html.touch #hud:has(#h-units:not([hidden])) #subtitle { bottom: calc(126px + env(safe-area-inset-bottom, 0px)); }
  html.touch #h-units .uc { width: 52px; }
}

/* ---- 画面の大きさの直し（どの端末にも効く） ---- */
/* 昇進の画面：高さの低い画面（携帯の横向き）では絵と字を縮め、下の釦は帯の上に置いて字に重ねない */
@media (max-height: 500px) {
  #screen .promo-cine { gap: 6px; padding-block: 10px 76px; min-height: auto; }
  #screen .promo-cine .pc-lbl { font-size: 11px; }
  #screen .promo-cine .pc-rank { font-size: clamp(22px, 7vh, 34px); }
  #screen .promo-cine .pc-ladder { margin: 0 0 2px; }
  #screen .promo-cine .pc-ladder i { width: 16px; height: calc(4px + var(--i) * 2px); }
  #screen .promo-cine .pc-ladder-lbl { margin: 0 0 2px; font-size: 11px; }
  #screen .promo-cine .pc-road b { font-size: 14px; }
  #screen .promo-cine .pc-band { gap: 14px; }
  #screen .promo-cine .pc-flag { height: 96px; }
  #screen .promo-cine .pc-flag canvas { width: 34px; height: 80px; }
  #screen .promo-cine .pc-say p { font-size: 15px; line-height: 1.6; }
  #screen .promo-cine .card { padding: 4px 10px; font-size: 13px; }
  #screen .promo-cine .pc-look .preview3d { width: 140px; height: 150px; }
  #screen .promo-cine .pc-look .preview3d.wide { width: 180px; height: 160px; }
  #screen .promo-cine .skiphint { display: none; }
  #screen .promo-cine #pc-next { position: fixed; left: 50%; transform: translateX(-50%); bottom: max(10px, env(safe-area-inset-bottom, 0px)); z-index: 5; }
  #screen .promo-cine::after { content: ''; position: fixed; left: 0; right: 0; bottom: 0; height: calc(78px + env(safe-area-inset-bottom, 0px)); z-index: 4; pointer-events: none; background: linear-gradient(180deg, rgba(20,18,15,0), rgba(20,18,15,.94) 32%); }
}
#tc { position: fixed; inset: 0; pointer-events: none; z-index: 6; font-family: var(--ui); color: var(--washi); }
#tc[hidden] { display: none !important; }
#tc .tb { position: absolute; pointer-events: auto; touch-action: none; display: grid; place-items: center; box-sizing: border-box;
  border-radius: 50%; border: 1.5px solid rgba(194,162,90,.62); background: rgba(14,11,8,.58); color: var(--washi);
  font: 700 13px/1.1 var(--ui); letter-spacing: .04em; text-shadow: 0 1px 2px #000; padding: 0; margin: 0;
  box-shadow: 0 0 0 1px rgba(0,0,0,.55), 0 2px 8px rgba(0,0,0,.35); transition: background .08s, transform .08s, border-color .08s; }
#tc .tb small { display: block; font-size: 11px; font-weight: 500; color: #f3d98a; margin-top: 2px; }
#tc .tb.on, #tc .tb:active { background: rgba(192,69,46,.82); border-color: #f0c070; transform: scale(.93); }
#tc .tb.sel { border-color: #f0c070; box-shadow: 0 0 0 2px rgba(240,192,112,.5), 0 2px 8px rgba(0,0,0,.35); }
#tc .tb.dim { opacity: .5; }
#tc .tb:focus-visible { outline: 3px solid #f0c070; outline-offset: 2px; }
#tc .tb.pop { animation: tcpop .16s ease-out; }
@keyframes tcpop { 0% { transform: scale(.86); } 60% { transform: scale(1.04) rotate(-2deg); } 100% { transform: scale(1); } }
#tc .tb.big { font-size: 17px; background: rgba(120,34,20,.62); border-width: 2px; }
#tc .tb .cd { position: absolute; inset: 0; border-radius: 50%; background: conic-gradient(rgba(0,0,0,.55) var(--p, 0%), transparent 0); pointer-events: none; }
/* 左上の小さな釦（一時停止・戦術地図） */
#tc .sq { border-radius: 10px; width: 48px; height: 48px; font-size: 12px; }
#tc .sq svg { width: 20px; height: 20px; display: block; margin: 0 auto 1px; }
/* 浮かぶ棒 */
#tc .stick { position: absolute; width: 124px; height: 124px; margin: -62px 0 0 -62px; border-radius: 50%; border: 2px solid rgba(236,228,210,.38); background: radial-gradient(circle, rgba(14,11,8,.12), rgba(14,11,8,.36)); pointer-events: none; }
#tc .stick.idle { opacity: .35; }
#tc .stick.run { border-color: rgba(240,150,90,.85); }
#tc .stick i { position: absolute; left: 50%; top: 50%; width: 56px; height: 56px; margin: -28px 0 0 -28px; border-radius: 50%; background: rgba(236,228,210,.5); box-shadow: 0 1px 6px rgba(0,0,0,.5); }
#tc .stick.run i { background: rgba(240,150,90,.8); }
#tc .stick b { position: absolute; left: 50%; top: -24px; transform: translateX(-50%); font-size: 11px; font-weight: 500; color: rgba(236,228,210,.75); white-space: nowrap; text-shadow: 0 1px 2px #000; }
#tc .hint { position: absolute; left: 50%; top: calc(6px + env(safe-area-inset-top, 0px)); z-index: 1; transform: translateX(-50%); padding: 6px 14px; background: rgba(12,10,8,.82); box-shadow: inset 0 0 0 1px rgba(194,162,90,.4); font-size: 13px; white-space: nowrap; }
body.rm #tc .tb, body.rm #tc .tb.pop { transition: none; animation: none; }
@media (prefers-reduced-motion: reduce) { #tc .tb, #tc .tb.pop { transition: none; animation: none; } }
/* 縦向きの札 */
#tc-rot { position: fixed; inset: 0; z-index: 90; display: grid; place-items: center; align-content: center; gap: 18px; background: var(--sumi, #14120f); color: var(--washi, #ece4d2); text-align: center; padding: 24px; font-family: var(--ui); }
#tc-rot[hidden] { display: none !important; }
#tc-rot svg { width: 84px; height: 84px; }
#tc-rot p { margin: 0; font-family: var(--display); font-size: 22px; letter-spacing: .12em; }
#tc-rot small { color: var(--washi-dim, #b9b09c); font-size: 14px; line-height: 1.7; }
#tc-rot button { min-height: 44px; padding: 0 18px; background: transparent; color: var(--washi-dim, #b9b09c); border: 1px solid rgba(236,228,210,.3); font: 500 14px var(--ui); }
`;

// 右下の丸の置き場所（突く の中心からのずれ。px）と大きさ（直径）
const BTN = [
  { id: 'atk', label: '突く', sub: '長押しで溜め', dx: 0, dy: 0, d: 84, big: true },
  { id: 'grd', label: '構え', dx: -98, dy: 10, d: 62 },
  { id: 'dodge', label: '回避', dx: -72, dy: -78, d: 58 },
  { id: 'lock', label: '狙い', dx: 12, dy: -96, d: 50 },
  { id: 'cmd', label: '号令', sub: '押して選ぶ', dx: -182, dy: 16, d: 60 },
  { id: 'rally', label: '鼓舞', dx: -160, dy: -60, d: 52 },
  { id: 'wpn', label: '持替', dx: -62, dy: -150, d: 48 },
  { id: 'use', label: '取る', dx: -124, dy: -134, d: 56 },
  { id: 'mount', label: '乗る', dx: -206, dy: -124, d: 50 },
];
const ICON = {
  pause: '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="5" y="4" width="3.2" height="12" fill="currentColor"/><rect x="11.8" y="4" width="3.2" height="12" fill="currentColor"/></svg>',
  map: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M2 5l5-2 6 2 5-2v12l-5 2-6-2-5 2z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M7 3v12M13 5v12" stroke="currentColor" stroke-width="1.2"/></svg>',
};

let T = null; // 動いている時の中身

// main.js から一度だけ呼ぶ。input・game と、一時停止・戦術地図の開け閉めを渡す
export function initTouch({ input, game, setPause, toggleBigMap }) {
  if (T) return null;
  // 見た目の上書き（触る物は html.touch の時だけ。画面の大きさの直しはどの端末にも効く）
  if (!document.getElementById('touch-css')) {
    const st = document.createElement('style');
    st.id = 'touch-css';
    st.textContent = CSS;
    document.head.appendChild(st);
  }
  if (!isTouch) return null;
  document.documentElement.classList.add('touch');
  // 指の端末ではマウスの固定（ポインタロック）を使わない
  game.noLock = true;
  // ページの拡大を止める（iOS の Safari は meta を聞かないことがあるので gesture も止める）
  const vp = document.querySelector('meta[name=viewport]');
  if (vp && !/maximum-scale/.test(vp.content)) vp.content += ', maximum-scale=1, user-scalable=no';
  for (const ev of ['gesturestart', 'gesturechange']) document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
  document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });

  const root = document.createElement('div');
  root.id = 'tc';
  root.hidden = true;
  root.innerHTML =
    `<div class="stick idle" id="tc-stick"><b>左の親指で歩く</b><i></i></div>` +
    `<button class="tb sq" id="tc-pause" aria-label="一時停止">${ICON.pause}止める</button>` +
    `<button class="tb sq" id="tc-map" aria-label="戦術地図">${ICON.map}地図</button>` +
    `<button class="tb sq" id="tc-view" aria-label="視点の切り替え（一人称）" aria-pressed="false"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M2 10c2.2-3.6 5-5.4 8-5.4s5.8 1.8 8 5.4c-2.2 3.6-5 5.4-8 5.4S4.2 13.6 2 10z" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="10" cy="10" r="2.6" fill="currentColor"/></svg>視点</button>` +
    BTN.map((b) => `<button class="tb${b.big ? ' big' : ''}" data-b="${b.id}" aria-label="${b.label}" style="width:${b.d}px;height:${b.d}px">${b.label}${b.sub ? `<small>${b.sub}</small>` : ''}</button>`).join('') +
    `<div class="hint" id="tc-hint" hidden></div>`;
  document.body.appendChild(root);
  const rot = document.createElement('div');
  rot.id = 'tc-rot';
  rot.hidden = true;
  rot.setAttribute('role', 'alertdialog');
  rot.setAttribute('aria-label', '画面を横にしてください');
  rot.innerHTML = '<svg viewBox="0 0 84 84" aria-hidden="true"><rect x="28" y="10" width="28" height="48" rx="4" fill="none" stroke="#c2a25a" stroke-width="2.5"/><rect x="14" y="44" width="48" height="28" rx="4" fill="none" stroke="#c0452e" stroke-width="2.5"/><path d="M66 24a18 18 0 0 1 4 18" fill="none" stroke="#c2a25a" stroke-width="2"/><path d="M71 38l-1 5-4-3" fill="none" stroke="#c2a25a" stroke-width="2"/></svg><p>画面を横にしてください</p><small>このゲームは横向きで遊びます。<br>戦の途中なら止めてあります。横にしてから「再開する」を押してください。</small><button id="tc-rot-go">縦のまま続ける</button>';
  document.body.appendChild(rot);
  const $ = (id) => document.getElementById(id);
  const btn = {};
  root.querySelectorAll('[data-b]').forEach((el) => { btn[el.dataset.b] = el; });

  T = {
    input, game, root, btn, stick: $('tc-stick'), hint: $('tc-hint'),
    move: null,      // 歩く指 { id, ox, oy, x, y }
    looks: new Map(),// 見回す指 id → { x, y }
    held: new Map(), // 押している丸 id → 指の id
    sticky: false,   // 号令の輪を開いたまま、行き先を指で選ぶのを待つ
    radialDrag: null,// 号令の丸を押したまま滑らせている { x, y, moved }
    kbd: false,      // キーボード・マウスを使っている間は丸を隠す
    rotOk: false,
    was: false,
  };

  // ---- 釦を押す・放す ----
  const buzz = (ms = 8) => { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* 非対応 */ } };
  const pop = (el) => { if (S.reduceMotion) return; el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); };
  const down = (id, el) => {
    const b = game.battle, p = b && b.player;
    if (!p || game.paused) return;
    buzz(id === 'atk' ? 10 : 7);
    pop(el);
    switch (id) {
      case 'atk': input.mouseL = true; input.leftPressed = true; break;
      case 'grd': input.mouseR = true; input.rightPressed = true; break;
      case 'dodge': input.edge.add('Space'); break;
      case 'lock': input.lockPressed = true; break;
      case 'rally': input.edge.add('KeyF'); break;
      case 'use': input.keys.add('KeyE'); input.edge.add('KeyE'); break;
      case 'mount': input.edge.add('KeyR'); break;
      case 'wpn': input.edge.add(p.weapon === 'spear' ? 'Digit2' : 'Digit1'); break;
      case 'cmd':
        if (T.sticky) { closeRadial(true); return; }
        input.keys.add('Tab'); input.edge.add('Tab');
        T.radialDrag = { moved: 0, vx: 0, vy: 0 };
        break;
    }
  };
  const up = (id) => {
    switch (id) {
      case 'atk': input.mouseL = false; break;
      case 'grd': input.mouseR = false; break;
      case 'use': input.keys.delete('KeyE'); break;
      case 'cmd': {
        const d = T.radialDrag; T.radialDrag = null;
        if (!d) break;
        // 滑らせて選んだ → 放して決める。滑らせずに放した → 輪を開いたまま、行き先を叩いて選ぶ
        if (d.moved > 24) { feedDrag(d); input.keys.delete('Tab'); }
        else { T.sticky = true; showHint('号令の輪：選ぶ号令を指で叩く（真ん中でやめる）'); }
        break;
      }
    }
  };
  const closeRadial = (cancel) => {
    const p = game.battle && game.battle.player;
    if (cancel && p && p.radialVec) { input.dx -= p.radialVec.x; input.dy -= p.radialVec.y; p.radialVec.x = 0; p.radialVec.y = 0; p.radialSel = -1; }
    input.keys.delete('Tab');
    T.sticky = false;
    showHint('');
  };
  // 号令の輪の中の行き先：画面の真ん中から指までの向き
  const aimRadial = (x, y) => {
    const p = game.battle && game.battle.player;
    if (!p || !p.radialVec) return;
    let vx = x - innerWidth / 2, vy = y - innerHeight / 2;
    const L = Math.hypot(vx, vy);
    if (L < 60) { vx = 0; vy = 0; } else { vx *= 140 / L; vy *= 140 / L; }
    input.dx += vx - p.radialVec.x; input.dy += vy - p.radialVec.y;
  };
  function showHint(s) { T.hint.hidden = !s; T.hint.textContent = s; T.hintT = s ? 6 : 0; }

  root.querySelectorAll('.tb').forEach((el) => {
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      T.kbd = false;
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* noop */ }
      el.classList.add('on');
      const id = el.dataset.b;
      if (id) { T.held.set(id, e.pointerId); down(id, el); }
      else { buzz(6); pop(el); }
    });
    el.addEventListener('pointermove', (e) => {
      if (el.dataset.b !== 'cmd' || !T.radialDrag || !T.held.has('cmd')) return;
      // 押したまま滑らせる：押し始めからの指の動きを、輪の向きにする（少し大きめに。輪が開いてから touchFrame で入れる）
      const d = T.radialDrag;
      if (!d.o) d.o = { x: e.clientX, y: e.clientY };
      d.vx = (e.clientX - d.o.x) * 2.4; d.vy = (e.clientY - d.o.y) * 2.4;
      d.moved = Math.max(d.moved, Math.hypot(e.clientX - d.o.x, e.clientY - d.o.y));
    });
    const end = (e) => {
      el.classList.remove('on');
      const id = el.dataset.b;
      if (id && T.held.get(id) === e.pointerId) { T.held.delete(id); up(id); }
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  });
  // 一時停止は放した時に（間違えて触れても、指をずらせば止めない）
  $('tc-pause').addEventListener('click', () => { if (game.battle && !game.battle.over && !game.paused) setPause(true); });
  $('tc-map').addEventListener('click', () => { if (game.battle && !game.paused) toggleBigMap(); });
  // 視点：三人称 ⇄ 一人称（V と同じ）
  $('tc-view').addEventListener('click', () => { if (game.battle && !game.paused) input.edge.add('KeyV'); });

  // ---- 画面を触る：左は歩く棒、右は見回す ----
  const canvas = document.getElementById('view');
  const active = () => game.battle && !game.paused && !game.photo;
  // 号令の輪を開いて待っている時は、画面のどこを叩いても（輪の札の上でも）行き先えらびにする
  window.addEventListener('pointerdown', (e) => {
    if (!T.sticky || !active() || (e.target.closest && e.target.closest('#tc'))) return;
    e.preventDefault(); e.stopPropagation();
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* noop */ }
    aimRadial(e.clientX, e.clientY);
    T.looks.set(e.pointerId, { x: e.clientX, y: e.clientY, radial: true });
  }, true);
  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' || !active() || T.looks.has(e.pointerId)) return;
    e.preventDefault();
    T.kbd = false;
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* noop */ }
    if (e.clientX < innerWidth * 0.42 && !T.move) {
      T.move = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: e.clientX, y: e.clientY };
    } else T.looks.set(e.pointerId, { x: e.clientX, y: e.clientY });
  });
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'mouse') return;
    if (T.move && T.move.id === e.pointerId) { T.move.x = e.clientX; T.move.y = e.clientY; return; }
    const l = T.looks.get(e.pointerId);
    if (!l) return;
    if (l.radial) { aimRadial(e.clientX, e.clientY); return; }
    // 指の動きをそのまま視点へ（指はマウスより動きが小さいので少し強める）
    input.dx += (e.clientX - l.x) * 1.7;
    input.dy += (e.clientY - l.y) * 1.5;
    l.x = e.clientX; l.y = e.clientY;
  });
  const cEnd = (e) => {
    if (T.move && T.move.id === e.pointerId) T.move = null;
    const l = T.looks.get(e.pointerId);
    if (l) {
      T.looks.delete(e.pointerId);
      if (l.radial) { aimRadial(e.clientX, e.clientY); input.keys.delete('Tab'); T.sticky = false; showHint(''); }
    }
  };
  canvas.addEventListener('pointerup', cEnd);
  canvas.addEventListener('pointercancel', cEnd);

  // HUD の札を叩く：選択肢・飛ばす・取る・小地図
  document.addEventListener('click', (e) => {
    if (!active()) return;
    const opt = e.target.closest && e.target.closest('#choice .opt');
    if (opt) { const i = [...opt.parentNode.querySelectorAll('.opt')].indexOf(opt); if (i >= 0 && i < 9) input.edge.add('Digit' + (i + 1)); return; }
    if (e.target.closest && e.target.closest('#skiphint')) { game.battle.skip(); return; }
    if (e.target.closest && e.target.closest('#prompt')) { input.edge.add('KeyE'); return; }
    if (e.target.closest && (e.target.closest('#subtitle') || e.target.closest('#sublog'))) { game.hud.toggleLog(); return; }
    if (e.target.id === 'minimap') toggleBigMap();
  });

  // キーボード・マウスを使い始めたら丸を隠す（iPad にキーボードをつないだ時）
  window.addEventListener('keydown', (e) => { if (game.battle && !(e.target instanceof HTMLInputElement)) T.kbd = true; });
  window.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse') T.kbd = false; }, true);

  // ---- 縦向きの札 ----
  const checkRot = () => {
    const tall = innerHeight > innerWidth * 1.05;
    const show = tall && !T.rotOk;
    rot.hidden = !show;
    if (show && game.battle && !game.battle.over && !game.paused) setPause(true);
  };
  $('tc-rot-go').onclick = () => { T.rotOk = true; checkRot(); };
  window.addEventListener('resize', checkRot);
  window.addEventListener('orientationchange', () => setTimeout(checkRot, 200));
  checkRot();
  return T;
}

// 毎フレーム（pollPad の後）呼ぶ：棒の向きを input へ入れ、丸の出し方を決める
export function touchFrame(dt) {
  if (!T) return;
  const { input, game, root, btn } = T;
  const b = game.battle, p = b && b.player;
  const on = !!(b && !b.over && !game.paused && !game.photo && !game.helpOpen && !T.kbd && document.getElementById('screen').hidden);
  // 戦が止まったら、押しっぱなしの物を全部放す
  if (!on && T.was) reset();
  T.was = on;
  root.hidden = !on;
  if (!on) return;
  // 右下の丸を並べる（安全な余白の中）
  if (!T.laid || T.lw !== innerWidth || T.lh !== innerHeight) layout();
  // 歩く棒
  const st = T.stick;
  if (T.move) {
    const R = 50;
    let dx = T.move.x - T.move.ox, dy = T.move.y - T.move.oy;
    const L = Math.hypot(dx, dy);
    // 端の外まで押し込むと走る
    const run = L > R * 1.2;
    // 指が遠くへ行ったら、棒の根も少しついて来る（押し込み続けても戻しやすい）
    if (L > R * 1.8) { const k = (L - R * 1.8) / L; T.move.ox += dx * k; T.move.oy += dy * k; dx = T.move.x - T.move.ox; dy = T.move.y - T.move.oy; }
    const m = Math.min(1, L / R);
    const ax = L > 0 ? dx / L * m : 0, ay = L > 0 ? dy / L * m : 0;
    input.axis = { x: ax, y: ay };
    input.runHeld = run;
    st.classList.remove('idle');
    st.hidden = false;
    st.classList.toggle('run', run);
    st.style.left = T.move.ox + 'px'; st.style.top = T.move.oy + 'px';
    st.firstElementChild.style.display = 'none';
    st.lastElementChild.style.transform = `translate(${(ax * R).toFixed(1)}px, ${(ay * R).toFixed(1)}px)`;
  } else {
    // ゲームパッドが無ければ（axis が空）走りも解く
    if (!input.axis) input.runHeld = false;
    st.classList.add('idle'); st.classList.remove('run');
    // 触れていない時は、初めの30秒だけ薄い棒を見せる（あとは景色を隠さない）
    st.hidden = b.t >= 30;
    // 薄い棒は、体力の札（左下）の上に置く
    if (!T.idleY || T.idleH !== innerHeight) { T.idleH = innerHeight; const bl = document.querySelector('#hud .bl'); const top = bl ? bl.getBoundingClientRect().top : innerHeight; T.idleY = Math.max(innerHeight * 0.45, (top > 0 ? top : innerHeight) - 76); }
    st.style.left = `calc(${110}px + env(safe-area-inset-left, 0px))`; st.style.top = `${T.idleY}px`;
    st.lastElementChild.style.transform = '';
    // 初めの30秒だけ「左の親指で歩く」の字
    st.firstElementChild.style.display = b.t < 30 ? '' : 'none';
  }
  // 丸の出し入れ（その時に使える物だけ）
  const hasSq = b.squad && b.squad.length > 0;
  btn.cmd.hidden = !hasSq;
  btn.cmd.classList.toggle('sel', !!p.radial || T.sticky);
  btn.wpn.hidden = !p.hasKatana;
  if (!btn.wpn.hidden) btn.wpn.firstChild.textContent = p.weapon === 'spear' ? '刀へ' : '槍へ';
  btn.mount.hidden = !p.canRide && !p.takeO;
  if (p.canRide) btn.mount.firstChild.textContent = p.mounted ? '降りる' : '乗る';
  const pr = document.getElementById('prompt');
  btn.use.hidden = !pr || pr.hidden;
  btn.lock.classList.toggle('sel', !!p.lock);
  { const v = document.getElementById('tc-view'), fp = S.view === 'first'; v.classList.toggle('sel', fp); v.setAttribute('aria-pressed', String(fp)); }
  btn.lock.firstChild.textContent = p.lock ? '解除' : '狙い';
  btn.grd.classList.toggle('sel', !!p.guard);
  btn.dodge.classList.toggle('dim', (p.mounted ? p.breath < 15 : p.sta < 20));
  if (p.mounted) btn.dodge.firstChild.textContent = '手綱'; else btn.dodge.firstChild.textContent = '回避';
  const rd = p.rallyCd || 0;
  btn.rally.firstChild.textContent = hasSq ? '鼓舞' : '鬨';
  btn.rally.classList.toggle('dim', rd > 0);
  let cd = btn.rally.querySelector('.cd');
  if (rd > 0) { if (!cd) { cd = document.createElement('span'); cd.className = 'cd'; btn.rally.appendChild(cd); } cd.style.setProperty('--p', Math.min(100, rd / 25 * 100).toFixed(0) + '%'); } else if (cd) cd.remove();
  btn.atk.lastElementChild.textContent = p.weapon === 'spear' ? '長押しで溜め' : '';
  if (T.radialDrag && p.radial) feedDrag(T.radialDrag);
  // 号令の輪：開いたまま待っている時は、放っておくと閉じる
  if (T.sticky && !input.keys.has('Tab')) T.sticky = false;
  if (!T.hint.hidden) { T.hintT -= dt; if (T.hintT <= 0 && !T.sticky) T.hint.hidden = true; }
}

// 号令の丸を押したまま滑らせた向きを、輪の選びへ（player.radialVec との差だけ入れる）
function feedDrag(d) {
  const p = T.game.battle && T.game.battle.player;
  if (!p || !p.radial || !p.radialVec) return;
  const L = Math.hypot(d.vx, d.vy), k = L > 140 ? 140 / L : 1;
  T.input.dx += d.vx * k - p.radialVec.x; T.input.dy += d.vy * k - p.radialVec.y;
}

function reset() {
  const { input } = T;
  input.mouseL = input.mouseR = false;
  input.keys.delete('Tab'); input.keys.delete('KeyE');
  input.runHeld = false;
  T.move = null; T.looks.clear(); T.held.clear(); T.sticky = false; T.radialDrag = null;
  T.root.querySelectorAll('.tb.on').forEach((el) => el.classList.remove('on'));
  if (T.hint) T.hint.hidden = true;
}

// 右下の丸・左上の釦を、画面の大きさと安全な余白に合わせて並べる
function layout() {
  T.laid = true; T.lw = innerWidth; T.lh = innerHeight;
  // env() は JS から直接読めないので、見えない物で測る
  let probe = document.getElementById('tc-probe');
  if (!probe) {
    probe = document.createElement('div');
    probe.id = 'tc-probe';
    probe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;left:0;top:0;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';
    document.body.appendChild(probe);
  }
  const ps = getComputedStyle(probe);
  const sa = { t: parseFloat(ps.paddingTop) || 0, r: parseFloat(ps.paddingRight) || 0, b: parseFloat(ps.paddingBottom) || 0, l: parseFloat(ps.paddingLeft) || 0 };
  // 画面が大きい（iPad）なら丸も少し大きく
  const k = Math.min(innerWidth, innerHeight) >= 700 ? 1.18 : 1;
  const cx = innerWidth - sa.r - 26 - 42 * k, cy = innerHeight - Math.max(sa.b, 8) - 22 - 42 * k;
  for (const d of BTN) {
    const el = T.btn[d.id];
    const s = d.d * k;
    el.style.width = el.style.height = s + 'px';
    el.style.left = (cx + d.dx * k - s / 2).toFixed(0) + 'px';
    el.style.top = (cy + d.dy * k - s / 2).toFixed(0) + 'px';
  }
  const pz = document.getElementById('tc-pause'), mp = document.getElementById('tc-map'), vw = document.getElementById('tc-view');
  pz.style.left = mp.style.left = vw.style.left = (sa.l + 12) + 'px';
  pz.style.top = (sa.t + 10) + 'px';
  mp.style.top = (sa.t + 66) + 'px';
  vw.style.top = (sa.t + 122) + 'px';
}
