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
  // 画面の札の量：携帯は「最小」（戦場を広く）。自分で選んで保存してあれば、そのまま
  if (isPhone && (!saved || !saved.hudMode)) S.hudMode = 'min';
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
/* 「取る」の丸と同じ事なので、触る端末では案内の札を出さず、丸に何を取るかを書く */
html.touch #prompt { display: none !important; }
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
  html.touch.tc-low .tl { left: calc(16px + env(safe-area-inset-left, 0px)); top: calc(62px + env(safe-area-inset-top, 0px)); }
  html.touch .bl { width: 220px; padding: 5px 10px 6px; gap: 3px; bottom: calc(8px + env(safe-area-inset-bottom, 0px)); }
  html.touch #compass { top: calc(44px + env(safe-area-inset-top, 0px)); width: min(360px, 44vw); }
  html.touch #armybar { width: min(460px, 52vw); top: calc(6px + env(safe-area-inset-top, 0px)); }
  /* 字幕と声は、左の棒・体力の札と右下の丸の間に（丸に重ねない） */
  html.touch #subtitle { font-size: 14px; bottom: calc(64px + env(safe-area-inset-bottom, 0px)); left: calc(50% - 24px); transform: translateX(-50%); max-width: min(44vw, 380px); }
  html.touch #bark { left: calc(50% - 24px); transform: translateX(-50%); max-width: min(44vw, 380px); }
  /* 号令の輪は縮めず（押せる大きさ 44px を保つ）、二字の項目を小さな楕円に並べ直す（横 140px・縦 105px）。
     右下の丸（陣形・射撃・号令）と重ならないよう、輪の真ん中を画面の 40% の所へ寄せる */
  html.touch #radial { left: 40%; }
  html.touch #radial::before { left: -200px; top: -140px; width: 400px; height: 280px; background: radial-gradient(ellipse, rgba(12,10,8,.2) 34%, rgba(12,10,8,.7) 35%, rgba(12,10,8,.7) 70%, transparent 71%); }
  html.touch #radial .rw:nth-child(1) { translate: 0 65px; }
  html.touch #radial .rw:nth-child(2) { translate: -21px 46px; }
  html.touch #radial .rw:nth-child(3) { translate: -30px 0; }
  html.touch #radial .rw:nth-child(4) { translate: -21px -46px; }
  html.touch #radial .rw:nth-child(5) { translate: 0 -65px; }
  html.touch #radial .rw:nth-child(6) { translate: 21px -46px; }
  html.touch #radial .rw:nth-child(7) { translate: 30px 0; }
  html.touch #radial .rw:nth-child(8) { translate: 21px 46px; }
  /* 輪を開いている間は、字幕と声の字を隠す（輪の字だけにする） */
  html.touch.tc-cmd #subtitle, html.touch.tc-cmd #bark { visibility: hidden; }
  html.touch #tc .hint.r { top: calc(8px + env(safe-area-inset-top, 0px)); font-size: 14px; padding: 6px 12px; }
  /* 携帯の横向きでは、号令の輪の字は項目の二字だけ（鍵・新・今・号令先の並び・真ん中の説明は出さない） */
  html.touch #radial .rw { width: 88px; left: -44px; font-size: 17px; }
  html.touch #radial .rw kbd, html.touch #radial .rw .why, html.touch #radial .rw .newm, html.touch #radial .rw .nowm, html.touch #radial .rw .sel,
  html.touch #radial .rc, html.touch #radial .rg, html.touch #radial .rgk { display: none; }
  html.touch #tc .look-hint { font-size: 13px; padding: 6px 10px; }
  /* 歩く棒の字は低い画面では出さない（左上の戦功の札とぶつかる。点線の輪だけで足りる） */
  html.touch #tc .stick b { display: none; }
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
#tc .tb small { display: block; font-size: 12px; font-weight: 500; color: #f3d98a; margin-top: 2px; }
/* 丸の下の小さな字は一行に収める（丸の外へはみ出さない）。「…ほか」の字も 12px より小さくしない */
#tc .tb small { max-width: calc(100% - 6px); white-space: nowrap; overflow: hidden; text-overflow: clip; }
html.touch #tc [data-b="more"] small { font-size: 12px; }
#tc .tb.on, #tc .tb:active { background: rgba(192,69,46,.82); border-color: #f0c070; transform: scale(.93); }
#tc .tb.sel { border-color: #f0c070; box-shadow: 0 0 0 2px rgba(240,192,112,.5), 0 2px 8px rgba(0,0,0,.35); }
#tc .tb.dim { opacity: .5; }
#tc .tb.quiet { opacity: .55; }
#tc .tb:focus-visible { outline: 3px solid #f0c070; outline-offset: 2px; }
#tc .tb.pop { animation: tcpop .16s ease-out; }
@keyframes tcpop { 0% { transform: scale(.86); } 60% { transform: scale(1.04) rotate(-2deg); } 100% { transform: scale(1); } }
#tc .tb.big { font-size: 17px; background: rgba(120,34,20,.62); border-width: 2px; }
#tc .tb .cd { position: absolute; inset: 0; border-radius: 50%; background: conic-gradient(rgba(0,0,0,.55) var(--p, 0%), transparent 0); pointer-events: none; }
/* 左上の小さな釦（一時停止・戦術地図） */
#tc .sq { border-radius: 10px; width: 48px; height: 48px; font-size: 12px; }
#tc .sq svg { width: 20px; height: 20px; display: block; margin: 0 auto 1px; }
/* 浮かぶ棒 */
#tc .stick { position: absolute; width: 124px; height: 124px; margin: -62px 0 0 -62px; border-radius: 50%; border: 2px dashed rgba(236,228,210,.5); background: radial-gradient(circle, rgba(14,11,8,.12), rgba(14,11,8,.36)); pointer-events: none; }
#tc .stick.idle { opacity: .35; }
/* 外の点線の輪が走る境目。越えると実線の朱になり「走る」と出る */
#tc .stick.run { border-color: rgba(240,150,90,.85); border-style: solid; }
#tc .stick i { position: absolute; left: 50%; top: 50%; width: 56px; height: 56px; margin: -28px 0 0 -28px; border-radius: 50%; background: rgba(236,228,210,.5); box-shadow: 0 1px 6px rgba(0,0,0,.5); }
#tc .stick.run i { background: rgba(240,150,90,.8); }
#tc .stick b { position: absolute; left: 50%; top: -26px; transform: translateX(-50%); font-size: 13px; font-weight: 500; color: rgba(236,228,210,.75); white-space: nowrap; text-shadow: 0 1px 2px #000; }
#tc .hint { position: absolute; left: 50%; top: calc(6px + env(safe-area-inset-top, 0px)); z-index: 1; transform: translateX(-50%); padding: 6px 14px; background: rgba(12,10,8,.82); box-shadow: inset 0 0 0 1px rgba(194,162,90,.4); font-size: 13px; white-space: nowrap; }
/* 号令の輪の案内は、輪のすぐ下に大きめに（上の帯と重ねない） */
#tc .hint.r { top: calc(50% + 206px); font-size: 15px; padding: 8px 16px; }
/* 溜め突き：溜まるにつれて「突く」の縁が金に満ちる */
#tc .tb .chg { position: absolute; inset: -4px; border-radius: 50%; pointer-events: none; background: conic-gradient(#f0c070 var(--p, 0%), transparent 0); -webkit-mask: radial-gradient(circle, transparent 62%, #000 63%); mask: radial-gradient(circle, transparent 62%, #000 63%); }
#tc .tb .chg.full { background: #f0c070; }
/* 手ほどき：いま試す丸を光らせる */
#tc .tb.glow, #tc .stick.glow { box-shadow: 0 0 0 3px #f0c070, 0 0 18px 4px rgba(240,192,112,.65); animation: tcglow 1.2s ease-in-out infinite; }
@keyframes tcglow { 50% { box-shadow: 0 0 0 3px #f0c070, 0 0 6px 1px rgba(240,192,112,.3); } }
body.rm #tc .tb.glow, body.rm #tc .stick.glow { animation: none; }
@media (prefers-reduced-motion: reduce) { #tc .tb.glow, #tc .stick.glow { animation: none; } }
#tc .look-hint { position: absolute; right: 22%; top: 38%; padding: 8px 14px; background: rgba(12,10,8,.78); box-shadow: inset 0 0 0 1px rgba(240,192,112,.7); font-size: 14px; pointer-events: none; }
body.rm #tc .tb, body.rm #tc .tb.pop { transition: none; animation: none; }
@media (prefers-reduced-motion: reduce) { #tc .tb, #tc .tb.pop { transition: none; animation: none; } }
/* 縦向きの札 */
#tc-rot { position: fixed; inset: 0; z-index: 90; display: grid; place-items: center; align-content: center; gap: 18px; background: var(--sumi, #14120f); color: var(--washi, #ece4d2); text-align: center; padding: 24px; font-family: var(--ui); }
#tc-rot[hidden] { display: none !important; }
#tc-rot svg { width: 84px; height: 84px; }
#tc-rot p { margin: 0; font-family: var(--display); font-size: 22px; letter-spacing: .12em; }
#tc-rot small { color: var(--washi-dim, #b9b09c); font-size: 14px; line-height: 1.7; }
#tc .tb.rl { opacity: .75; background-image: conic-gradient(rgba(243,217,138,.55) var(--rl, 0%), transparent 0); }
#tc .tb.ready { box-shadow: 0 0 0 3px #f3d98a, 0 0 18px rgba(243,217,138,.6); }
#tc-rot button { min-height: 44px; padding: 0 18px; background: transparent; color: var(--washi-dim, #b9b09c); border: 1px solid rgba(236,228,210,.3); font: 500 14px var(--ui); }
`;

// 右下の丸の置き場所（突く の中心からのずれ。px）と大きさ（直径）
const BTN = [
  { id: 'atk', label: '突く', sub: '長押しで溜め', dx: 0, dy: 0, d: 84, big: true },
  { id: 'grd', label: '構え', dx: -98, dy: 10, d: 62 },
  { id: 'dodge', label: '回避', dx: -72, dy: -78, d: 58 },
  { id: 'lock', label: '狙い', dx: 12, dy: -98, d: 54 },
  { id: 'cmd', label: '号令', sub: '輪で選ぶ', dx: -182, dy: 16, d: 60 },
  { id: 'rally', label: '鼓舞', dx: -160, dy: -60, d: 52 },
  { id: 'wpn', label: '持替', dx: -62, dy: -150, d: 48 },
  { id: 'use', label: '取る', dx: -124, dy: -134, d: 56 },
  { id: 'mount', label: '乗る', dx: -206, dy: -124, d: 50 },
  // 号令の輪を開いている間だけ出す（組頭から）：陣形の切り替えと、弓・鉄砲の射撃の切り替え
  // 低い画面（スマホ横）で、六つ目からの丸（鼓舞・持ち替え・乗り降り）を畳む「…」の丸
  { id: 'more', label: '…', sub: 'ほか', dx: -172, dy: -188, d: 46 },
  { id: 'form', label: '陣形', dx: -236, dy: -46, d: 52 },
  { id: 'fire', label: '射撃', dx: -240, dy: 44, d: 52 },
];
const ICON = {
  pause: '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="5" y="4" width="3.2" height="12" fill="currentColor"/><rect x="11.8" y="4" width="3.2" height="12" fill="currentColor"/></svg>',
  map: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M2 5l5-2 6 2 5-2v12l-5 2-6-2-5 2z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M7 3v12M13 5v12" stroke="currentColor" stroke-width="1.2"/></svg>',
};

let T = null; // 動いている時の中身

// main.js から一度だけ呼ぶ。input・game と、一時停止・戦術地図の開け閉めを渡す
export function initTouch(o) {
  if (T) return null;
  const { input, game, setPause, toggleBigMap } = o;
  // 見た目の上書き（触る物は html.touch の時だけ。画面の大きさの直しはどの端末にも効く）
  if (!document.getElementById('touch-css')) {
    const st = document.createElement('style');
    st.id = 'touch-css';
    st.textContent = CSS;
    document.head.appendChild(st);
  }
  // 指の端末と決まっていなくても（キーボード付きの iPad・触れる Windows）、画面を指で触れたら丸を出す
  if (!isTouch) {
    const first = (e) => { if (e.pointerType !== 'touch' || T) return; window.removeEventListener('pointerdown', first, true); setupTouch(o); };
    window.addEventListener('pointerdown', first, true);
    return null;
  }
  return setupTouch(o);
}
function setupTouch({ input, game, setPause, toggleBigMap }) {
  document.documentElement.classList.add('touch');
  // 枠の中（claude.ai のアプリで開いた Artifact など）では、画面の上の角にアプリの「×」「共有」の丸が重なる。上を空ける印
  let framed = false;
  try { framed = window.top !== window.self; } catch (e) { framed = true; }
  if (framed || /[?&]inframe/.test(location.search)) document.documentElement.classList.add('inframe');
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
    `<button class="tb sq" id="tc-zin" aria-label="大地図を寄せる" hidden>＋<small>寄る</small></button>` +
    `<button class="tb sq" id="tc-zout" aria-label="大地図を引く" hidden>－<small>引く</small></button>` +
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
  // 震え：設定の「振動」を切ると震えない
  const buzz = (ms = 8) => { if (S.vibrate === false) return; try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* 非対応 */ } };
  const pop = (el) => { if (S.reduceMotion) return; el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); };
  const down = (id, el) => {
    const b = game.battle, p = b && b.player;
    if (!p || game.paused) return;
    buzz(id === 'atk' ? 10 : 7);
    pop(el);
    if (T.more) T.moreT = 0;
    switch (id) {
      case 'atk': input.mouseL = true; input.leftPressed = true; break;
      case 'grd': input.mouseR = true; input.rightPressed = true; break;
      case 'dodge': input.edge.add('Space'); break;
      case 'lock': input.lockPressed = true; break;
      case 'rally': input.edge.add('KeyF'); break;
      case 'use': input.keys.add('KeyE'); input.edge.add('KeyE'); break;
      case 'mount': input.edge.add('KeyR'); break;
      // 持っている得物を 槍→刀→火縄銃→弓 と回す（player.js の WeaponNext）
      case 'wpn': input.edge.add('WeaponNext'); break;
      case 'form': case 'fire': p.command(id); closeRadial(false); break;
      case 'more': T.more = !T.more; T.moreT = 0; break;
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
        if (d.moved > 24) {
          // 輪が開く前（0.22秒より短い）に素早くなぞって放した時も、なぞった向きの号令を出す（指揮の札を開かない）
          const p = game.battle && game.battle.player;
          if (p && !p.radial && p.flickRadial) p.flickRadial(d.vx, d.vy); else feedDrag(d);
          input.keys.delete('Tab');
        }
        else { T.sticky = true; showHint(innerHeight < 500 ? 'なぞって放す' : '号令の輪：選ぶ号令を指で押して放す（なぞってもよい・真ん中でやめる）', true); }
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
    // 輪の真ん中（携帯の横向きでは左へ寄せてある）から指までの向き
    const rr = document.getElementById('radial'), rc = rr && !rr.hidden ? rr.getBoundingClientRect() : null;
    let vx = x - (rc ? rc.left : innerWidth / 2), vy = y - (rc ? rc.top : innerHeight / 2);
    const L = Math.hypot(vx, vy);
    if (L < 60) { vx = 0; vy = 0; } else { vx *= 140 / L; vy *= 140 / L; }
    input.dx += vx - p.radialVec.x; input.dy += vy - p.radialVec.y;
  };
  // r：号令の輪の案内（輪のすぐ下に出す）
  // 携帯の横向きでは 3 秒で消す（字で景色を隠さない）
  function showHint(s, r) { T.hint.hidden = !s; T.hint.textContent = s; T.hint.classList.toggle('r', !!r); T.hintT = s ? (innerHeight < 500 ? 3 : 6) : 0; }

  root.querySelectorAll('.tb').forEach((el) => {
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      T.kbd = false;
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* noop */ }
      el.classList.add('on');
      const id = el.dataset.b;
      if (id) { T.held.set(id, e.pointerId); down(id, el); }
      else { buzz(6); pop(el); }
      el._o = { x: e.clientX, y: e.clientY, look: false };
    });
    el.addEventListener('pointermove', (e) => {
      // 丸の上から始まった指が 12px より動いたら、見回しのなぞりに替える（構え・突きの押しっぱなしは放す）
      const o = el._o, id0 = el.dataset.b;
      if (o && id0 !== 'cmd' && T.held.get(id0) === e.pointerId) {
        if (!o.look && Math.hypot(e.clientX - o.x, e.clientY - o.y) > 12) { o.look = true; o.lx = e.clientX; o.ly = e.clientY; el.classList.remove('on'); if (id0 === 'atk' || id0 === 'grd') up(id0); }
        if (o.look) { const k = S.sens || 1; input.dx += (e.clientX - o.lx) * 1.7 * k; input.dy += (e.clientY - o.ly) * 1.5 * k; o.lx = e.clientX; o.ly = e.clientY; }
        return;
      }
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
  // 大地図の縮尺：＋・－の釦と、二本指で拡げる・つまむ
  $('tc-zin').addEventListener('click', () => { if (game.hud && game.hud.zoomBigmap) game.hud.zoomBigmap(-250); });
  $('tc-zout').addEventListener('click', () => { if (game.hud && game.hud.zoomBigmap) game.hud.zoomBigmap(250); });
  const bmP = new Map();
  let bmD = 0;
  const bmMove = (e) => {
    if (!bmP.has(e.pointerId)) return;
    bmP.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (bmP.size !== 2) return;
    const [a, c] = [...bmP.values()], d = Math.hypot(a.x - c.x, a.y - c.y);
    if (bmD && game.hud && game.hud.zoomBigmap) game.hud.zoomBigmap((bmD - d) * 6);
    bmD = d;
  };
  document.addEventListener('pointerdown', (e) => { if (e.pointerType === 'mouse' || !(e.target.closest && e.target.closest('#bigmap'))) return; bmP.set(e.pointerId, { x: e.clientX, y: e.clientY }); bmD = 0; }, true);
  document.addEventListener('pointermove', bmMove, true);
  const bmUp = (e) => { bmP.delete(e.pointerId); bmD = 0; };
  document.addEventListener('pointerup', bmUp, true);
  document.addEventListener('pointercancel', bmUp, true);
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
    // 画面の端から 16px は受けない（iOS の戻る・切り替えのなぞりと取り合わない）
    if (e.clientX < 16 || e.clientX > innerWidth - 16) return;
    T.kbd = false;
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* noop */ }
    // 歩く所は左の 42%（左利きの入れ替えでは右の 42%）
    const moveSide = S.touchSwap ? e.clientX > innerWidth * 0.58 : e.clientX < innerWidth * 0.42;
    if (moveSide && !T.move) {
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
    const k = (S.sens || 1) * (S.touchSens || 1);
    input.dx += (e.clientX - l.x) * 1.7 * k;
    input.dy += (e.clientY - l.y) * 1.5 * k;
    l.x = e.clientX; l.y = e.clientY;
  });
  const cEnd = (e) => {
    if (T.move && T.move.id === e.pointerId) T.move = null;
    const l = T.looks.get(e.pointerId);
    if (l) {
      T.looks.delete(e.pointerId);
      if (l.radial) { aimRadial(e.clientX, e.clientY); input.keys.delete('Tab'); T.sticky = false; showHint(''); }
    }
    if (T.move === null) T.runLatch = false;
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

  // 組の札（#h-units）を長押しすると、組の兵の頭の上に居場所と名の印を出す（PC の Alt と同じ）。放すと消す
  let unitsHold = null;
  const unitsUp = () => { if (unitsHold) { clearTimeout(unitsHold.t); if (unitsHold.on) { input.keys.delete('AltLeft'); T.eatClick = true; setTimeout(() => { T.eatClick = false; }, 400); } unitsHold = null; } };
  document.addEventListener('pointerdown', (e) => {
    if (!active() || !(e.target.closest && e.target.closest('#h-units'))) return;
    unitsHold = { on: false, t: setTimeout(() => { if (!unitsHold) return; unitsHold.on = true; input.keys.add('AltLeft'); buzz(12); showHint('組の居場所を頭の上に出している（指を放すと消える）'); }, 450) };
  }, true);
  document.addEventListener('pointerup', unitsUp, true);
  document.addEventListener('pointercancel', unitsUp, true);
  // 長押しの後の「押した」は、号令先の切り替えにしない
  document.addEventListener('click', (e) => { if (T.eatClick && e.target.closest && e.target.closest('#h-units')) { e.stopPropagation(); e.preventDefault(); T.eatClick = false; } }, true);

  // キーボード・マウスを使い始めたら丸を隠す（iPad にキーボードをつないだ時）
  window.addEventListener('keydown', (e) => { if (game.battle && !(e.target instanceof HTMLInputElement)) T.kbd = true; });
  window.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse') T.kbd = false; }, true);

  // ---- 縦向きの札 ----
  const checkRot = () => {
    const tall = innerHeight > innerWidth * 1.05;
    // 横にしたら「縦のまま続ける」の答えを忘れる（次に縦にした時にもう一度聞く）
    if (!tall) T.rotOk = false;
    // iPad（大きい画面）は縦のままでも遊べる（丸は下にまとまる）
    const show = tall && !T.rotOk && isPhone;
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
  if (!T.scr) T.scr = document.getElementById('screen');
  const on = !!(b && !b.over && !game.paused && !game.photo && !game.helpOpen && !T.kbd && T.scr.hidden);
  // 戦が止まったら、押しっぱなしの物を全部放す
  if (!on && T.was) reset();
  // ゲームの外の画面（城下・図鑑・設定）では、ページの拡大を許す（戦の間だけ止める）
  const inGame = !!b;
  if (T.zoomLock !== inGame) { T.zoomLock = inGame; setZoomLock(inGame); }
  T.was = on;
  if (root.hidden !== !on) root.hidden = !on;
  if (!on) return;
  // 右下の丸を並べる（安全な余白の中）
  const lk = `${innerWidth}|${innerHeight}|${S.touchSwap ? 1 : 0}|${S.touchSize || 'm'}|${S.touchAlpha || 1}`;
  if (T.lk !== lk) { T.lk = lk; layout(); }
  // 歩く棒
  const st = T.stick;
  if (T.move) {
    const R = 50;
    let dx = T.move.x - T.move.ox, dy = T.move.y - T.move.oy;
    const L = Math.hypot(dx, dy);
    // 端の外（60px、点線の輪）まで押し込むと走る。走りを切替式にしていれば、一度越えたら指を放すまで走り続ける
    let run = L > R * 1.2;
    if (S.runToggle) { if (run) T.runLatch = true; run = run || !!T.runLatch; }
    // 触れただけで歩き出さないよう、8px の遊び
    if (L < 8) { dx = 0; dy = 0; }
    // 指が遠くへ行ったら、棒の根も少しついて来る（押し込み続けても戻しやすい）
    if (L > R * 1.8) { const k = (L - R * 1.8) / L; T.move.ox += dx * k; T.move.oy += dy * k; dx = T.move.x - T.move.ox; dy = T.move.y - T.move.oy; }
    const L2 = Math.hypot(dx, dy);
    const m = Math.min(1, Math.max(0, L2 - 8) / (R - 8));
    const ax = L2 > 0 ? dx / L2 * m : 0, ay = L2 > 0 ? dy / L2 * m : 0;
    input.axis = { x: ax, y: ay };
    input.runHeld = run;
    st.classList.remove('idle');
    st.hidden = false;
    st.classList.toggle('run', run);
    st.style.left = T.move.ox + 'px'; st.style.top = T.move.oy + 'px';
    // 走っている時は「走る」と字でも出す（色だけに頼らない）
    setText(st.firstElementChild, '走る');
    st.firstElementChild.style.display = run ? '' : 'none';
    st.lastElementChild.style.transform = `translate(${(ax * R).toFixed(1)}px, ${(ay * R).toFixed(1)}px)`;
  } else {
    // ゲームパッドが無ければ（axis が空）走りも解く
    if (!input.axis) input.runHeld = false;
    st.classList.add('idle'); st.classList.remove('run');
    // 触れていない時は、初めの30秒（初めての戦は60秒）だけ薄い棒を見せる（あとは景色を隠さない）
    const idleT = b.index === 0 ? 60 : 30;
    st.hidden = b.t >= idleT && !T.glowMove;
    // 薄い棒は、体力の札（左下）の上に置く
    if (!T.idleY || T.idleH !== innerHeight) { T.idleH = innerHeight; const bl = document.querySelector('#hud .bl'); const top = bl ? bl.getBoundingClientRect().top : innerHeight; T.idleY = Math.max(innerHeight * 0.45, (top > 0 ? top : innerHeight) - 76); }
    st.style.left = S.touchSwap ? `calc(100% - 110px - env(safe-area-inset-right, 0px))` : `calc(${110}px + env(safe-area-inset-left, 0px))`; st.style.top = `${T.idleY}px`;
    st.lastElementChild.style.transform = '';
    // 初めのうちだけ「左の親指で歩く」の字
    setText(st.firstElementChild, S.touchSwap ? '右の親指で歩く' : '左の親指で歩く');
    st.firstElementChild.style.display = b.t < idleT || T.glowMove ? '' : 'none';
  }
  // 丸の出し入れ（その時に使える物だけ）。突く・構え・回避（馬上は手綱）は戦の間いつも出す
  const hasSq = b.squad && b.squad.length > 0;
  const rid = p.mounted;
  hide(btn.atk, false); hide(btn.grd, false); hide(btn.dodge, false);
  // 馬上は 突く・構え・手綱・降りる（と号令）だけにし、狙い・鼓舞・持ち替えは隠す（丸が七つ並ばないように）
  hide(btn.lock, rid);
  hide(btn.cmd, !hasSq);
  tog(btn.cmd, 'sel', !!p.radial || T.sticky);
  const wl = p.weaponList ? p.weaponList() : ['spear'];
  hide(btn.wpn, wl.length < 2 || rid);
  if (!btn.wpn.hidden) { const nx = wl[(wl.indexOf(p.weapon) + 1) % wl.length]; setText(btn.wpn.firstChild, { spear: '槍へ', sword: '刀へ', gun: '鉄砲へ', bow: '弓へ' }[nx]); }
  // 鉄砲・弓を持っている時：突く→放つ／射る、構え→狙う。鉄砲は込め直しの進みを丸の縁に、込め終えて狙っていれば光る
  const gunW = p.weapon === 'gun', bowW = p.weapon === 'bow';
  setText(btn.atk.firstChild, gunW ? '放つ' : bowW ? '射る' : '突く');
  setText(btn.grd.firstChild, gunW || bowW ? '狙う' : '構え');
  const sub = btn.atk.querySelector('small');
  if (sub) setText(sub, gunW ? (p.gunLoaded ? '狙って放つ' : '込め中') : bowW ? '押して引く' : '長押しで溜め');
  tog(btn.atk, 'rl', gunW && !p.gunLoaded);
  tog(btn.atk, 'ready', gunW && p.gunLoaded && (p.aimK || 0) > 0.5);
  if (gunW && !p.gunLoaded) btn.atk.style.setProperty('--rl', `${Math.round((p.gunReload || 0) * 100)}%`);
  // 陣形・射撃の丸は、号令の輪を開いている間だけ（射撃は弓・鉄砲の組がいる時）
  const rOpen = hasSq && (!!p.radial || T.sticky) && (b.G.rank >= 2);
  hide(btn.form, !rOpen);
  hide(btn.fire, !rOpen || !b.squadGroups.some((g) => g.count > 0 && (g.kind === 'bow' || g.kind === 'gun')));
  // 空馬の手綱を取れる時は、乗り降りの丸を「手綱」にして必ず出す
  hide(btn.mount, !p.canRide && !p.takeO);
  if (p.canRide) setText(btn.mount.firstChild, p.mounted ? '降りる' : '乗る');
  else if (p.takeO) setText(btn.mount.firstChild, '手綱');
  // 「取る」の丸：案内の札（#prompt）の代わりに、何を取るかを丸の下に書く
  if (!T.pr) T.pr = document.getElementById('prompt');
  const pr = T.pr;
  const canUse = !!pr && !pr.hidden;
  hide(btn.use, !canUse);
  if (canUse) {
    const tx = [...pr.childNodes].filter((n) => !(n.tagName === 'KBD')).map((n) => n.textContent).join('').replace(/^\s*(押して：)?/, '').trim();
    // 丸に収まる短い字：「柵を引き倒す」→「引き倒す」のように、を の後の動きだけ。長ければ四字まで
    const vb = tx.includes('を') ? tx.slice(tx.lastIndexOf('を') + 1) : tx;
    const short = vb.length > 4 ? vb.slice(0, 4) : vb;
    let sm = btn.use.querySelector('small');
    if (!sm) { sm = document.createElement('small'); btn.use.appendChild(sm); }
    setText(sm, short);
    btn.use.setAttribute('aria-label', tx || '取る');
  }
  tog(btn.lock, 'sel', !!p.lock);
  // 平時は狙いと鼓舞の丸を薄く（隠すと押したい時に見つからないので、隠さずに控えめに）
  const calm = game.hud && game.hud.root.classList.contains('calm') && !p.lock;
  tog(btn.lock, 'quiet', calm);
  tog(btn.rally, 'quiet', calm);
  { const v = document.getElementById('tc-view'), fp = S.view === 'first'; tog(v, 'sel', fp); if (v.getAttribute('aria-pressed') !== String(fp)) v.setAttribute('aria-pressed', String(fp)); }
  setText(btn.lock.firstChild, p.lock ? '解除' : '狙い');
  tog(btn.grd, 'sel', !!p.guard);
  tog(btn.dodge, 'dim', (p.mounted ? p.breath < 15 : p.sta < 20));
  setText(btn.dodge.firstChild, p.mounted ? '手綱' : '回避');
  const rd = p.rallyCd || 0;
  hide(btn.rally, rid);
  setText(btn.rally.firstChild, hasSq ? '鼓舞' : '鬨');
  tog(btn.rally, 'dim', rd > 0);
  let cd = btn.rally.querySelector('.cd');
  if (rd > 0) { if (!cd) { cd = document.createElement('span'); cd.className = 'cd'; btn.rally.appendChild(cd); } cd.style.setProperty('--p', Math.min(100, rd / 25 * 100).toFixed(0) + '%'); } else if (cd) cd.remove();
  // 刀は小さな字なし（鉄砲・弓の字「込め中」「狙って放つ」「押して引く」は上で書いたまま残す）
  if (p.weapon === 'sword') setText(btn.atk.querySelector('small'), '');
  // 溜め突き：溜まるにつれて縁が金に満ちる（0.7 秒で満ちる）
  let ch = btn.atk.querySelector('.chg');
  const cT = p.weapon === 'spear' && p.charging ? Math.min(1, (p.chargeT || 0) / 0.7) : 0;
  if (cT > 0) { if (!ch) { ch = document.createElement('span'); ch.className = 'chg'; btn.atk.appendChild(ch); } ch.style.setProperty('--p', (cT * 100).toFixed(0) + '%'); tog(ch, 'full', cT >= 1); } else if (ch) ch.remove();
  // 低い画面（スマホ横）では、右下の丸は六つまで（突く・構え・回避・号令・取る・狙いの順。馬上は乗り降り、鉄砲持ちは持替を先に）。
  // 残り（鼓舞・持ち替え・乗り降り）は「…」の丸に畳み、押すと開く。号令の間は組の札を出す印も付ける
  const low = innerHeight < 500;
  // 馬上・空馬の手綱を取れる時は「降りる／手綱」を狙いより先に（畳むと馬を降りられなくなる）。
  // 鉄砲・弓を持てる時は「持替」を鼓舞より先に（鉄砲へ持ち替えるのに「…」を開かなくて済む）
  // 降りた馬がすぐそば（乗れる所）にいる時も「乗る」を先に（畳むと、降りた後にすぐ乗り直せない）
  const L = p.loose, nearHorse = !rid && p.canRide && L && L.mode !== 'fled' && Math.hypot(L.x - p.u.pos.x, L.z - p.u.pos.z) < 3.2;
  const order = rid || p.takeO || nearHorse ? ['atk', 'grd', 'dodge', 'cmd', 'use', 'mount', 'lock', 'rally', 'wpn']
    : wl.includes('gun') || wl.includes('bow') ? ['atk', 'grd', 'dodge', 'cmd', 'use', 'lock', 'wpn', 'mount', 'rally']
      : ['atk', 'grd', 'dodge', 'cmd', 'use', 'lock', 'mount', 'rally', 'wpn'];
  const want = order.filter((id) => !btn[id].hidden);
  // 六つまでは右下に並べても重ならない（七つ目から「…」に畳む）
  const keep = low ? want.slice(0, 6) : want;
  const fold = want.filter((id) => !keep.includes(id));
  T.folded = new Set(fold);
  for (const id of fold) hide(btn[id], !T.more);
  if (!fold.length) T.more = false;
  hide(btn.more, !low || !fold.length);
  tog(btn.more, 'sel', !!T.more);
  if (T.more && (T.moreT = (T.moreT || 0) + dt) > 6) T.more = false;
  tog(document.documentElement, 'tc-cmd', !!(p.radial || T.sticky || p.cmdOpen));
  // 大地図を開いている間だけ、縮尺の釦を出す
  const bm = !!(game.hud && game.hud.bigmap);
  hide(document.getElementById('tc-zin'), !bm); hide(document.getElementById('tc-zout'), !bm);
  // 初めての手ほどき：いま試す操作の丸を光らせる（歩く・見回すは棒と画面の右に字）
  coachGlow(b);
  if (T.radialDrag && p.radial) feedDrag(T.radialDrag);
  // 号令の輪：開いたまま待っている時は、放っておくと閉じる
  if (T.sticky && !input.keys.has('Tab')) T.sticky = false;
  if (!T.hint.hidden) { T.hintT -= dt; if (T.hintT <= 0 && (!T.sticky || innerHeight < 500)) T.hint.hidden = true; }
}

// 毎コマ同じ値を書き直さない（書くたびに画面の組み直しが起きて、古い端末で重くなる）
function setText(el, t) { if (el && el.textContent !== t) el.textContent = t; }
function tog(el, c, on) { if (el && el.classList.contains(c) !== !!on) el.classList.toggle(c, !!on); }
function hide(el, h) { if (el && el.hidden !== !!h) el.hidden = !!h; }

// ページの拡大：戦の間は止め、ゲームの外の画面では許す
function setZoomLock(on) {
  const vp = document.querySelector('meta[name=viewport]');
  if (!vp) return;
  const base = vp.content.replace(/,\s*maximum-scale=[^,]*/g, '').replace(/,\s*user-scalable=[^,]*/g, '');
  const want = on ? base + ', maximum-scale=1, user-scalable=no' : base;
  if (vp.content !== want) vp.content = want;
  document.documentElement.classList.toggle('tc-zoom', !on);
}

// 手ほどきの段に合わせて、試す丸を光らせる
const COACH_BTN = { c_swing: 'atk', c_guard: 'grd', c_dodge: 'dodge', c_cmd: 'cmd', thrust: 'atk', combo: 'atk', charged: 'atk', guard: 'grd', sweep: 'grd', parry: 'grd', dodge: 'dodge', radial: 'cmd', cmd_follow: 'cmd', cmd_hold: 'cmd', cmd_retreat: 'cmd', cmd_yari: 'cmd', cmd_fire: 'cmd' };
function coachGlow(b) {
  // 初めての戦の手ほどき（auto）と、戦ごとの手ほどき（桶狭間の稽古など）の両方
  const t = b.tut || null;
  const cur = t ? t.items.find((x) => !x.done) : null;
  const id = cur ? cur.id : '';
  if (T.glowId === id) return;
  T.glowId = id;
  for (const el of T.root.querySelectorAll('.glow')) el.classList.remove('glow');
  T.glowMove = id === 'c_move' || id === 'move' || id === 'run';
  if (T.glowMove) T.stick.classList.add('glow');
  if (COACH_BTN[id] && T.btn[COACH_BTN[id]]) T.btn[COACH_BTN[id]].classList.add('glow');
  if (id === 'c_view') { const v = document.getElementById('tc-view'); if (v) v.classList.add('glow'); }
  let lh = T.root.querySelector('.look-hint');
  if (id === 'c_look') { if (!lh) { lh = document.createElement('div'); lh.className = 'look-hint'; T.root.appendChild(lh); } lh.textContent = S.touchSwap ? '左をなぞって見回す' : '右をなぞって見回す'; lh.hidden = false; clearTimeout(T.lhT); T.lhT = setTimeout(() => { lh.hidden = true; }, 3000); }
  else if (lh) lh.hidden = true;
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
  input.keys.delete('Tab'); input.keys.delete('KeyE'); input.keys.delete('AltLeft');
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
  // 画面が大きい（iPad）なら丸も少し大きく。設定の丸の大きさ（小・中・大）も掛ける
  const k = (Math.min(innerWidth, innerHeight) >= 700 ? 1.18 : 1) * ({ s: 0.88, m: 1, l: 1.14 }[S.touchSize] || 1);
  // 左利きの入れ替え：丸は左下、歩く棒は右へ（丸の並びも左右を裏返す）
  const sw = !!S.touchSwap, mir = sw ? -1 : 1;
  const R0 = 26 + 42 * k;
  const cx = sw ? sa.l + R0 : innerWidth - sa.r - R0, cy = innerHeight - Math.max(sa.b, 8) - 22 - 42 * k;
  for (const d of BTN) {
    const el = T.btn[d.id];
    const s = d.d * k;
    el.style.width = el.style.height = s + 'px';
    el.style.left = (cx + d.dx * k * mir - s / 2).toFixed(0) + 'px';
    el.style.top = (cy + d.dy * k - s / 2).toFixed(0) + 'px';
  }
  // 丸の透け具合（設定）
  T.root.style.opacity = S.touchAlpha && S.touchAlpha < 1 ? String(Math.max(0.35, S.touchAlpha)) : '';
  const pz = document.getElementById('tc-pause'), mp = document.getElementById('tc-map'), vw = document.getElementById('tc-view');
  // 高さの低い画面（携帯の横向き）では、止める・地図・視点を横に並べる（縦に並べると上の札を右へ押しやる）
  const low = innerHeight < 500;
  document.documentElement.classList.toggle('tc-low', low);
  // 枠の中なら、アプリの丸（上端から 70px ほど）の下から並べる
  const FT = document.documentElement.classList.contains('inframe') ? 64 : 0;
  const L0 = Math.max(16, sa.l + 12), T0 = Math.max(sa.t, FT) + (low ? 8 : 10);
  const zi = document.getElementById('tc-zin'), zo = document.getElementById('tc-zout');
  if (low) {
    pz.style.top = mp.style.top = vw.style.top = T0 + 'px';
    pz.style.left = L0 + 'px'; mp.style.left = (L0 + 54) + 'px'; vw.style.left = (L0 + 108) + 'px';
    zi.style.top = zo.style.top = T0 + 'px'; zi.style.left = (L0 + 162) + 'px'; zo.style.left = (L0 + 216) + 'px';
  } else {
    zi.style.left = zo.style.left = L0 + 'px'; zi.style.top = (T0 + 168) + 'px'; zo.style.top = (T0 + 224) + 'px';
    pz.style.left = mp.style.left = vw.style.left = L0 + 'px';
    pz.style.top = T0 + 'px';
    mp.style.top = (T0 + 56) + 'px';
    vw.style.top = (T0 + 112) + 'px';
  }
}
