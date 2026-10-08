// 触る操作（携帯・iPad）
// 左の親指：触れた所に出る浮かぶ棒で歩く（端の外まで倒すと走る）
// 右側をなぞる：視点。右下の丸：突く（押し続けて溜め突き）・構える・回避・号令の輪・鼓舞・狙い・持ち替え・乗り降り・取る
// 左上：一時停止と戦術地図。PC（触らない端末）では何も出さない
import { S, reduceMotion } from './settings.js';

// 主な指し物が指か。最初に指で触れた時も更新し、ほかの画面へ伝える。
export let isTouch = typeof window !== 'undefined' && matchMedia('(pointer: coarse)').matches;
// 携帯か（短い辺が 600px 未満）
let isPhone = isTouch && Math.min(screen.width, screen.height) < 600;

// 触る端末の札と描く回数の既定。画質は main.js が実測で決める。
// 端末ごとの初期値と保存値の検査は settings.js にまとめる。

const CSS = `
/* 触る端末だけ：ページの拡大・端の戻る・長押しの選択を止める */
html.touch, html.touch body { overscroll-behavior: none; touch-action: manipulation; -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; -webkit-tap-highlight-color: transparent; }
html.touch input, html.touch textarea { -webkit-user-select: text; user-select: text; }
html.touch canvas#view { touch-action: none; }
/* 横向きの安全な余白（切り欠き・下の帯） */
html.touch #screen { padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); padding-bottom: env(safe-area-inset-bottom, 0px); }
html.touch .tl { left: calc(76px + env(safe-area-inset-left, 0px)); }
html.touch .bl { left: calc(16px + env(safe-area-inset-left, 0px)); }
html.touch .tr { right: calc(16px + env(safe-area-inset-right, 0px)); }
html.touch .toastbox { right: calc(20px + env(safe-area-inset-right, 0px)); }
/* 下の早見の帯は丸の釦と同じことをするので、触る端末では隠す */
html.touch #h-bottom { display: none !important; }
/* 指の操作では、技や号令に鍵盤の名前を重ねない */
html.touch #hud kbd, html.touch #hud .slot em { display: none !important; }
/* 数字の欄も空け、選び肢の名前と説明を札の幅いっぱいに出す */
html.touch #hud #choice .opt { grid-template-columns: minmax(0, 1fr); }
html.touch #hud #choice .opt small { grid-column: 1; }
/* 号令の顔の札は、右下の丸と重ならないよう下の真ん中へ */
html.touch #h-units { right: auto; left: 50%; transform: translateX(-50%); bottom: calc(10px + env(safe-area-inset-bottom, 0px)); max-width: 34vw; justify-content: center; }
/* 小地図は押すと戦術地図が開く */
html.touch #minimap { pointer-events: auto; }
/* 体力札と、送り読みの要らない手ほどきは、下の戦場へ指を通す。 */
html.touch #hud .bl, html.touch #hud .bl * { pointer-events: none; }
/* 任務の本文は見回す指を通し、一覧の行だけを押せるようにする。 */
html.touch #hud #objectives:not(.expand), html.touch #hud #objectives:not(.expand) * { pointer-events: none; }
html.touch #hud #objectives:not(.expand) li.more, html.touch #hud #objectives:not(.expand) li.more * { pointer-events: auto; }
html.touch #hud #objectives.expand { pointer-events: auto; }
html.touch #hud #tutorial:not(.tc-scroll) { pointer-events: none !important; }
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
  html.touch .lead { font-size: max(15px, calc(15px * var(--text-scale, 1))); line-height: 1.7; }
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
  /* 判断の札も、輪を開いている間は隠す（左上の札が輪の左半分を覆い、突撃・狙え・続けが見えなくなる。閉じれば戻る） */
  html.touch.tc-cmd #choice { visibility: hidden; }
  html.touch #tc .hint.r { top: calc(8px + env(safe-area-inset-top, 0px)); font-size: 14px; padding: 6px 12px; }
  /* 携帯の横向きでは、号令の輪の字は項目の二字だけ（鍵・新・今・号令先の並び・真ん中の説明は出さない） */
  html.touch #radial .rw { width: 88px; left: -44px; font-size: 17px; }
  html.touch #radial .rw kbd, html.touch #radial .rw .why, html.touch #radial .rw .newm, html.touch #radial .rw .nowm, html.touch #radial .rw .sel,
  html.touch #radial .rg, html.touch #radial .rgk { display: none; }
  html.touch #radial .rc { display: block; width: 116px; left: -58px; font-size: 12px; line-height: 1.4; }
  html.touch #radial .rw.on .why, html.touch #radial .rw:focus .why { display: block; font-size: 12px; }
  html.touch #tc .look-hint { font-size: max(15px, calc(15px * var(--text-scale, 1))); padding: 6px 10px; top: 22%; }
  /* 歩く棒の字は低い画面では出さない（左上の戦功の札とぶつかる。点線の輪だけで足りる） */
  html.touch #tc .stick b { display: none; top: auto; bottom: -26px; color: #ece4d2; }
  html.touch #h-units { max-width: 30vw; }
  html.touch #hud:has(#h-units:not([hidden])) #subtitle { bottom: calc(126px + env(safe-area-inset-bottom, 0px)); }
  html.touch #h-units .uc { width: 52px; }
}

/* 触る端末の「最小」（.lean）：組の札の帯は号令の輪を開いている間だけ（平時の戦場を札で埋めない） */
html.touch:not(.tc-cmd) #hud.lean #h-units { display: none; }
/* 任務は今の一行だけ（「現在の任務」の見出しも出さない） */
#hud.lean #objectives h4 { display: none; }
/* iPad（高い画面）の「最小」：ヒントの札は細く小さく（戦場の左を塞がない。字は大きすぎない） */
@media (min-height: 501px) {
  html.touch #hud.lean #tutorial { width: auto; max-width: 250px; padding: 7px 11px 8px; font-size: 13px; line-height: 1.5; background: rgba(12,10,8,.62); }
}

/* ---- 画面の大きさの直し（どの端末にも効く） ---- */
/* 昇進の画面：高さの低い画面（携帯の横向き）では絵と字を縮め、下の釦は帯の上に置いて字に重ねない */
@media (max-height: 500px) {
  #screen .promo-cine { gap: 6px; padding-block: 10px 76px; min-height: auto; }
  #screen .promo-cine .pc-lbl { font-size: 12px; }
  #screen .promo-cine .pc-rank { font-size: clamp(22px, 7vh, 34px); }
  #screen .promo-cine .pc-ladder { margin: 0 0 2px; }
  #screen .promo-cine .pc-ladder i { width: 16px; height: calc(4px + var(--i) * 2px); }
  #screen .promo-cine .pc-ladder-lbl { margin: 0 0 2px; font-size: 12px; }
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
  border-radius: 50%; border: 1.5px solid rgba(194,162,90,.62); background: rgba(14,11,8,var(--tc-bg, .58)); color: var(--washi);
  font: 700 13px/1.1 var(--ui); letter-spacing: .04em; text-shadow: 0 1px 2px #000; padding: 0; margin: 0;
  box-shadow: 0 0 0 1px rgba(0,0,0,.55), 0 2px 8px rgba(0,0,0,.35); transition: background .08s, border-radius .08s, border-color .08s; }
#tc .tb .name, #tc .tb small { background: #14120f; border-radius: 4px; padding: 2px; position: relative; z-index: 1; }
#tc .tb small { display: block; font-size: 12px; font-weight: 500; color: #f3d98a; margin-top: 2px; }
/* 丸の下の小さな字は一行に収める（丸の外へはみ出さない）。「…ほか」の字も 12px より小さくしない */
#tc .tb small { max-width: calc(100% - 6px); white-space: normal; line-height: 1.15; overflow: hidden; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }   /* 丸の添え書きは二行まで折り返し、「…」で切らない */
#tc .tb.tech small { color: #fff; font-weight: 700; white-space: pre-line; line-height: 1.2; }
html.touch #tc [data-b="more"] small { font-size: 12px; }
#tc .tb.sel { border-color: #f0c070; box-shadow: 0 0 0 2px rgba(240,192,112,.5), 0 2px 8px rgba(0,0,0,.35); }
#tc .tb.dim { border-style: dashed; }
#tc .tb.quiet { border-color: rgba(194,162,90,.4); }
#tc .tb:focus-visible { outline: 3px solid #f0c070; outline-offset: 2px; box-shadow: 0 0 0 6px #14120f; }
#tc .tb.pop { animation: tcpop .18s ease-out; }
@keyframes tcpop { 0%, 70% { background: #70291c; border-color: #f0c070; border-radius: 50%; box-shadow: inset 0 0 0 2px #f0c070, 0 0 12px rgba(240,192,112,.6); } }
#tc .tb.big { font-size: 17px; background: rgba(120,34,20,var(--tc-bg, .62)); border-width: 2px; }
/* 押せる丸を保ち、朱の地と金の光で手応えを出す */
#tc .tb.on, #tc .tb:active { background: #70291c; border-color: #f0c070; border-radius: 50%; box-shadow: inset 0 0 0 2px #f0c070, 0 0 12px rgba(240,192,112,.6); }
#tc .tb .cd { position: absolute; inset: 0; border-radius: 50%; background: conic-gradient(rgba(0,0,0,.55) var(--p, 0%), transparent 0); pointer-events: none; }
/* 左上の小さな釦（一時停止・戦術地図） */
#tc .sq { border-radius: 10px; width: 48px; height: 48px; font-size: 12px; }
#tc .sq svg { width: 20px; height: 20px; display: block; margin: 0 auto 1px; }
/* 浮かぶ棒 */
#tc .stick { position: absolute; width: 124px; height: 124px; margin: -62px 0 0 -62px; border-radius: 50%; border: 2px dashed rgba(236,228,210,.5); background: radial-gradient(circle, rgba(14,11,8,.12), rgba(14,11,8,.36)); pointer-events: none; }
#tc .stick.idle { opacity: .35; }
/* 歩く棒の効く所（左下）。慣れるまで（戦の初めの間）うっすら見せ、あとは消える */
#tc .mzone { position: absolute; left: 0; bottom: 0; width: 34vw; height: 55vh; pointer-events: none; border-top-right-radius: 28px;
  background: linear-gradient(0deg, rgba(236,228,210,.07), rgba(236,228,210,.02)); box-shadow: inset -1px 1px 0 rgba(236,228,210,.16); transition: opacity 1.2s; }
#tc .mzone.sw { left: auto; right: 0; border-top-right-radius: 0; border-top-left-radius: 28px; box-shadow: inset 1px 1px 0 rgba(236,228,210,.16); }
#tc .mzone.off { opacity: 0; }
#tc .move-hint { position: absolute; padding: 4px 8px; font-size: 13px; line-height: 1.4; background: #14120f; color: #ece4d2; pointer-events: none; white-space: normal; }
body.rm #tc .mzone { transition: none; }
@media (prefers-reduced-motion: reduce) { #tc .mzone { transition: none; } }
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
/* 二段目は角のある外縁。内側の満ちた輪は溜め突きの印として残す。 */
#tc .tb .chg.second { inset: -8px; border-radius: 25%; -webkit-mask: none; mask: none; }
#tc .tb .chg.second::after { content: ''; position: absolute; inset: 3px; border-radius: 25%; background: #14120f; }
#tc .tb .chg.second + .chg { inset: -4px; }
/* 手ほどき：いま試す丸を光らせる */
#tc .tb.glow, #tc .stick.glow { box-shadow: 0 0 0 3px #f0c070, 0 0 18px 4px rgba(240,192,112,.65); animation: tcglow 1.2s ease-in-out infinite; }
@keyframes tcglow { 50% { box-shadow: 0 0 0 3px #f0c070, 0 0 6px 1px rgba(240,192,112,.3); } }
body.rm #tc .tb.glow, body.rm #tc .stick.glow { animation: none; }
@media (prefers-reduced-motion: reduce) { #tc .tb.glow, #tc .stick.glow { animation: none; } }
#tc .look-hint { position: absolute; right: 22%; top: 38%; padding: 8px 14px; background: rgba(12,10,8,.78); box-shadow: inset 0 0 0 1px rgba(240,192,112,.7); font-size: 14px; pointer-events: none; }
body.rm #tc .tb, body.rm #tc .tb.pop { transition: none; animation: none; }
@media (prefers-reduced-motion: reduce) { #tc .tb, #tc .tb.pop { transition: none; animation: none; } }
/* 縦向きの札 */
#tc-rot { box-sizing: border-box; max-height: 100dvh; overflow-y: auto; position: fixed; inset: 0; z-index: 90; display: grid; place-items: center; align-content: center; gap: 18px; background: var(--sumi, #14120f); color: var(--washi, #ece4d2); text-align: center; padding: 24px; font-family: var(--ui); }
#tc-rot[hidden] { display: none !important; }
#tc-rot svg { width: 84px; height: 84px; }
#tc-rot p { margin: 0; font-family: var(--display); font-size: 22px; letter-spacing: .12em; }
#tc-rot small { color: var(--washi-dim, #b9b09c); font-size: 14px; line-height: 1.7; }
#tc .tb.rl { background-image: conic-gradient(rgba(243,217,138,.55) var(--rl, 0%), transparent 0); }
#tc .tb.ready { box-shadow: 0 0 0 3px #f3d98a, 0 0 18px rgba(243,217,138,.6); }
#tc-rot button { min-height: 44px; padding: 0 18px; background: transparent; color: var(--washi-dim, #b9b09c); border: 1px solid rgba(236,228,210,.3); font: 500 14px var(--ui); }
`;

// 親指側から四列・下から三段。追加の丸を開いても主な操作は動かさない
const MELEE_LABEL = { thrust: '離して突く', charged: '離して\n溜め突き', spin: '離して\n振り回す', slam: '離して叩く', hook: '離して\n引き倒す', sweep: '離して払う', butt: '離して\n石突き', slash: '離して斬る', kthrust: '離して突く', nagi: '離して\n横薙ぎ', kara: '離して\n真っ向' };
const TOUCH_EDGES = ['Tab', 'KeyE', 'Space', 'HorseRein', 'KeyQ', 'KeyF', 'KeyR', 'WeaponNext', 'KeyV'];
const LABEL_BTNS = ['atk', 'grd', 'dodge', 'lock', 'rally', 'wpn', 'mount', 'more', 'use', 'form'];
const HOLD_RING_BTNS = ['use', 'cmd'];
const TOGGLE_BTNS = ['grd', 'lock', 'cmd', 'more', 'fire'];
const ORDER_HORSE = ['atk', 'grd', 'dodge', 'cmd', 'mount', 'lock', 'use', 'wpn', 'fire', 'rally'];
const ORDER_RANGED = ['atk', 'grd', 'dodge', 'cmd', 'mount', 'lock', 'wpn', 'use', 'fire', 'rally'];
const ORDER_FOOT = ['atk', 'grd', 'dodge', 'cmd', 'mount', 'lock', 'use', 'fire', 'rally', 'wpn'];
const BTN = [
  { id: 'atk', label: '突く', sub: '長押しで溜め', col: 0, row: 0, d: 84, big: true },
  { id: 'grd', label: '構える', col: 0, row: 1, d: 64 },
  { id: 'dodge', label: '回避', col: 1, row: 0, d: 64 },
  { id: 'lock', label: '狙い', col: 1, row: 1, d: 60 },
  { id: 'cmd', label: '号令', sub: '開く', col: 2, row: 0, d: 56 },
  { id: 'rally', label: '鼓舞', col: 2, row: 2, d: 52 },
  { id: 'wpn', label: '持替', col: 0, row: 2, d: 48 },
  { id: 'use', label: '取る', col: 1, row: 2, d: 56 },
  { id: 'mount', label: '乗る', col: 2, row: 1, d: 56 },
  // 号令の輪を開いている間だけ出す（組頭から）：陣形の切り替えと、弓・鉄砲の射撃の切り替え
  // 低い画面（スマホ横）で、六つ目からの丸（鼓舞・持ち替え・乗り降り）を畳む「…」の丸
  { id: 'more', label: '…', sub: 'ほか', col: 3, row: 0, d: 48 },
  { id: 'form', label: '陣形', col: 3, row: 2, d: 48 },
  { id: 'fire', label: '射撃', col: 3, row: 1, d: 48 },
];
const ICON = {
  pause: '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="5" y="4" width="3.2" height="12" fill="currentColor"/><rect x="11.8" y="4" width="3.2" height="12" fill="currentColor"/></svg>',
  map: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M2 5l5-2 6 2 5-2v12l-5 2-6-2-5 2z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M7 3v12M13 5v12" stroke="currentColor" stroke-width="1.2"/></svg>',
};

let T = null; // 動いている時の中身
// 指の釦が使う入力そのもの。描画の更新を待たずに試遊へ渡す。
// 対象を省いた呼び出しにも対応し、指定された時は別の遊びの入力を渡さない。
export function touchInput(game) { return T && (game === undefined || T.game === game) ? T.input : null; }

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
  isTouch = true;
  isPhone = Math.min(screen.width, screen.height) < 600;
  document.documentElement.classList.add('touch');
  // 枠の中（claude.ai のアプリで開いた Artifact など）では、画面の上の角にアプリの「×」「共有」の丸が重なる。上を空ける印
  let framed = false;
  try { framed = window.top !== window.self; } catch (e) { framed = true; }
  if (framed || /[?&]inframe/.test(location.search)) document.documentElement.classList.add('inframe');
  // 指の端末ではマウスの固定（ポインタロック）を使わない
  game.noLock = true;
  // ページの拡大を止める（iOS の Safari は meta を聞かないことがあるので gesture も止める）
  setZoomLock(false);
  for (const ev of ['gesturestart', 'gesturechange']) document.addEventListener(ev, (e) => { if (T?.zoomLock) e.preventDefault(); }, { passive: false });
  document.addEventListener('dblclick', (e) => { if (T?.zoomLock) e.preventDefault(); }, { passive: false });

  const root = document.createElement('div');
  root.id = 'tc';
  root.hidden = true;
  root.innerHTML =
    `<div class="mzone" id="tc-mzone" aria-hidden="true"></div><div class="move-hint" id="tc-move-hint" hidden></div>` +
    `<div class="stick idle" id="tc-stick"><b>左の親指で歩く</b><i></i></div>` +
    `<button class="tb sq" id="tc-pause" aria-label="一時停止">${ICON.pause}止める</button>` +
    `<button class="tb sq" id="tc-map" aria-label="戦術地図">${ICON.map}地図</button>` +
    `<button class="tb sq" id="tc-view" aria-label="視点の切り替え（一人称）" aria-pressed="false"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M2 10c2.2-3.6 5-5.4 8-5.4s5.8 1.8 8 5.4c-2.2 3.6-5 5.4-8 5.4S4.2 13.6 2 10z" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="10" cy="10" r="2.6" fill="currentColor"/></svg>視点</button>` +
    BTN.map((b) => `<button class="tb${b.big ? ' big' : ''}" data-b="${b.id}" aria-label="${b.label}" style="width:${b.d}px;height:${b.d}px"><span class="name">${b.label}</span>${b.sub ? `<small>${b.sub}</small>` : ''}</button>`).join('') +
    `<button class="tb sq" id="tc-zin" aria-label="大地図を寄せる" hidden>＋<small>寄る</small></button>` +
    `<button class="tb sq" id="tc-zout" aria-label="大地図を引く" hidden>－<small>引く</small></button>` +
    `<div class="hint" id="tc-hint" hidden></div>`;
  const extraHelp = document.createElement('span'); extraHelp.id = 'tc-extra-help'; extraHelp.textContent = '武器の持ち替え・鼓舞・馬の追加操作'; extraHelp.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)'; root.appendChild(extraHelp);
  root.querySelector('[data-b=more]').setAttribute('aria-describedby', extraHelp.id);
  root.querySelector('[data-b=wpn]').setAttribute('aria-describedby', extraHelp.id);
  document.body.appendChild(root);
  const rot = document.createElement('div');
  rot.id = 'tc-rot';
  rot.hidden = true;
  rot.setAttribute('role', 'alertdialog');
  rot.setAttribute('aria-label', '画面を横にしてください');
  rot.setAttribute('aria-describedby', 'tc-rot-desc');
  rot.innerHTML = '<svg viewBox="0 0 84 84" aria-hidden="true"><rect x="28" y="10" width="28" height="48" rx="4" fill="none" stroke="#c2a25a" stroke-width="2.5"/><rect x="14" y="44" width="48" height="28" rx="4" fill="none" stroke="#c0452e" stroke-width="2.5"/><path d="M66 24a18 18 0 0 1 4 18" fill="none" stroke="#c2a25a" stroke-width="2"/><path d="M71 38l-1 5-4-3" fill="none" stroke="#c2a25a" stroke-width="2"/></svg><p>画面を横にしてください</p><small id="tc-rot-desc">このゲームは横向きで遊びます。<br>戦の途中なら止めてあります。横にしてから「再開する」を押してください。</small><small id="tc-rot-pause" hidden>戦は止めたままです。次の札で「再開する」を押してください。</small><button id="tc-rot-go" aria-describedby="tc-rot-pause">縦のまま続ける</button>';
  document.body.appendChild(rot);
  const $ = (id) => document.getElementById(id);
  const btn = {};
  root.querySelectorAll('[data-b]').forEach((el) => { btn[el.dataset.b] = el; });

  T = {
    input, game, root, btn, stick: $('tc-stick'), hint: $('tc-hint'),
    move: null,      // 歩く指 { id, ox, oy, x, y }
    axis: { x: 0, y: 0 },
    want: [], fold: [],
    zoneBlocks: [{ el: document.getElementById('tutorial'), on: false }],
    zoneRects: BTN.map(() => ({ left: 0, right: 0, top: 0, bottom: 0, on: false })),
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
  // 振動に対応したブラウザだけ、短い手応えを返す。
  // ブラウザでは navigator.vibrate（iPhone の Safari は震えない）
  const haptic = (k, s = 0.6) => {
    if (S.vibrate === false) return;
    const ms = { tap: 6, select: 10, block: 18, order: 24, gun: 40, hurt: 30 }[k] || Math.round(8 + 30 * s);
    try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* 非対応 */ }
  };
  const buzz = (ms = 8) => haptic(ms <= 8 ? 'tap' : ms <= 14 ? 'select' : 'hit', Math.min(1, ms / 40));
  game.haptic = haptic;
  const pop = (el) => { if (reduceMotion()) return; el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); };
  const down = (id, el) => {
    const b = game.battle, p = b && b.player;
    if (el.disabled || el.hidden || !p || !p.u.alive || !active()) return;
    haptic('tap', id === 'atk' ? 0.8 : 0.5);
    pop(el);
    if (T.more) T.moreT = 0;
    switch (id) {
      case 'atk':
        // 一つの親指で構えから攻めへ。弓・鉄砲の狙いは残す。
        if (input.touchGuardToggle && p.weapon !== 'gun' && p.weapon !== 'bow' && !T.held.has('grd')) p.guardOn = false;
        input.mouseL = true; input.leftPressed = true; break;
      case 'grd': input.touchGuardToggle = true; input.mouseR = true; input.rightPressed = true; break;
      case 'dodge': input.edge.add(p.mounted ? 'HorseRein' : 'Space'); break;
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
          input.dx = input.dy = input.touchDx = input.touchDy = 0;
          input.edge.delete('Tab');
          if (p && p.flickRadial) {
            const trace = p.touchRadialTrace || (p.touchRadialTrace = {});
            trace.x = d.vx; trace.y = d.vy; trace.cancelled = false;
            trace.selected = Math.hypot(d.vx, d.vy) < 25 ? -1 : Math.round(((Math.atan2(d.vx, -d.vy) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 4)) % 8;
            trace.released = trace.selected;
            trace.accepted = p.flickRadial(d.vx, d.vy);
          }
          closeRadial(true);
          input.dx = input.dy = input.touchDx = input.touchDy = 0;
        }
        else { T.sticky = true; showHint(innerHeight < 500 ? 'なぞって放す' : '号令の輪：選ぶ号令を指で押して放す（なぞってもよい・真ん中でやめる）', true); }
        break;
      }
    }
  };
  const closeRadial = (cancel) => {
    const p = game.battle && game.battle.player;
    if (cancel && p && p.radialVec) { input.dx -= p.radialVec.x; input.dy -= p.radialVec.y; p.radialVec.x = 0; p.radialVec.y = 0; p.radialSel = -1; }
    input.keys.delete('Tab'); input.edge.delete('Tab');
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
    let selected = -1;
    if (L < 60) { vx = 0; vy = 0; }
    else {
      // 横向きの輪は楕円。札の実際の中心で選び、同じ番号の向きを更新と解放に渡す。
      let nearest = Infinity, i = 0;
      if (rc) for (const el of rr.querySelectorAll('.rw')) {
        const rect = el.getBoundingClientRect();
        const dist = Math.hypot(x - rect.left - rect.width / 2, y - rect.top - rect.height / 2);
        if (dist < nearest) { nearest = dist; selected = i; }
        i++;
      }
      if (selected < 0) selected = Math.round(((Math.atan2(vx, -vy) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 4)) % 8;
      const angle = selected * Math.PI / 4;
      vx = Math.sin(angle) * 140; vy = -Math.cos(angle) * 140;
    }
    const trace = p.touchRadialTrace || (p.touchRadialTrace = {});
    trace.x = x; trace.y = y; trace.selected = selected; trace.released = null; trace.accepted = false; trace.cancelled = false;
    // 同じコマに何度なぞっても、最後の位置だけを選びへ渡す。
    input.dx = vx - p.radialVec.x; input.dy = vy - p.radialVec.y;
    input.touchDx = input.touchDy = 0;
  };
  // r：号令の輪の案内（輪のすぐ下に出す）
  // 携帯の横向きでは 3 秒で消す（字で景色を隠さない）
  function showHint(s, r) { T.hint.hidden = !s; T.hint.textContent = s; T.hint.classList.toggle('r', !!r); T.hintT = s ? (innerHeight < 500 ? 3 : 6) : 0; }

  root.querySelectorAll('.tb').forEach((el) => {
    el.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      if (el.disabled || !active() || el._keyHeld || el._o || (el.dataset.b && T.held.has(el.dataset.b))) return;
      // 同じ指を別の丸へ渡さない。二本指の構え＋攻撃はそのまま使える。
      for (const pointer of T.held.values()) if (pointer === e.pointerId) return;
      T.kbd = false; el._keyClick = false;
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* noop */ }
      el.classList.add('on');
      const id = el.dataset.b;
      if (id) { T.held.set(id, e.pointerId); down(id, el); if (id === 'cmd' && T.radialDrag) T.radialDrag.o = { x: e.clientX, y: e.clientY }; }
      else { buzz(6); pop(el); }
      el._o = { id: e.pointerId, x: e.clientX, y: e.clientY, look: false };
    });
    el.addEventListener('pointermove', (e) => {
      // 親指の小さな揺れでは長押しを取り消さない。大きく滑らせれば見回しへ。
      const o = el._o, id0 = el.dataset.b;
      if (!o || o.id !== e.pointerId || !active()) return;
      if (id0 && T.held.get(id0) !== e.pointerId) return;
      if (o && id0 !== 'cmd' && T.held.get(id0) === e.pointerId) {
        // 鉄砲・弓の「狙う」「射る」は、押したまま指を滑らせて狙いを動かせる（放さない。放つの丸を押して撃つ）
        const pl = game.battle && game.battle.player, aimHold = (id0 === 'atk' || id0 === 'grd') && pl && (pl.weapon === 'gun' || pl.weapon === 'bow');
        if (!o.look && Math.hypot(e.clientX - o.x, e.clientY - o.y) > (aimHold ? 12 : 28)) {
          o.look = true; o.lx = e.clientX; o.ly = e.clientY;
          if (!aimHold) {
            el.classList.remove('on');
            if (id0 === 'atk') { input.leftPressed = false; pl?.cancelAttack(); }
            if (id0 === 'grd') { input.rightPressed = false; if (pl) pl.guardOn = false; }
            if (id0 === 'dodge') { input.edge.delete('HorseRein'); input.edge.delete('Space'); }
            if (id0 === 'use') input.edge.delete('KeyE');
            if (id0 === 'atk' || id0 === 'grd' || id0 === 'use') up(id0);
          }
        }
        if (o.look) { const k = S.touchSens || 1, aimSlow = aimHold ? 0.35 : 1, dx = (e.clientX - o.lx) * 1.7 * k * aimSlow, dy = (e.clientY - o.ly) * 1.5 * k * aimSlow; input.dx += dx; input.dy += dy; input.touchDx += dx; input.touchDy += dy; o.lx = e.clientX; o.ly = e.clientY; }
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
      const id = el.dataset.b;
      if (!el._o || el._o.id !== e.pointerId) return;
      if (id === 'cmd') {
        const p = game.battle?.player;
        if (p) { const trace = p.touchRadialTrace || (p.touchRadialTrace = {}); trace.releaseX = Number.isFinite(e.clientX) ? e.clientX : el._o.x; trace.releaseY = Number.isFinite(e.clientY) ? e.clientY : el._o.y; trace.cancelled = e.type === 'pointercancel'; if (trace.cancelled) { trace.released = -1; trace.accepted = false; } }
      }
      el._cancelClick = e.type === 'pointercancel' || !!el._o.look || Math.hypot(e.clientX - el._o.x, e.clientY - el._o.y) > 12;
      if (e.type === 'pointercancel') {
        const p = game.battle?.player;
        if (id === 'atk') { input.leftPressed = false; p?.cancelAttack(); }
        if (id === 'grd') { input.rightPressed = false; if (p) p.guardOn = false; }
        if (id === 'dodge') { input.edge.delete('HorseRein'); input.edge.delete('Space'); }
        if (id === 'use') input.edge.delete('KeyE');
      }
      if (id && T.held.get(id) !== e.pointerId) return;
      el.classList.remove('on'); el._o = null;
      if (id === 'cmd' && T.held.get(id) === e.pointerId && T.radialDrag) {
        const d = T.radialDrag;
        if (e.type === 'pointercancel') { const p = game.battle?.player; if (p) { const trace = p.touchRadialTrace || (p.touchRadialTrace = {}); trace.cancelled = true; trace.accepted = false; trace.released = null; } T.radialDrag = null; closeRadial(true); }
        else if (d.o) {
          d.vx = (e.clientX - d.o.x) * 2.4; d.vy = (e.clientY - d.o.y) * 2.4;
          d.moved = Math.max(d.moved, Math.hypot(e.clientX - d.o.x, e.clientY - d.o.y));
        }
      }
      if (id && T.held.get(id) === e.pointerId) { T.held.delete(id); up(id); }
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('lostpointercapture', (e) => { if (el._o?.id === e.pointerId) end({ type: 'pointercancel', pointerId: e.pointerId }); });
    el.addEventListener('keydown', (e) => {
      const id = el.dataset.b;
      if (!id || (e.code !== 'Space' && e.code !== 'Enter')) return;
      e.preventDefault(); e.stopPropagation();
      if (!active() || el.disabled || el.hidden || el._o || T.held.has(id) || e.repeat || el._keyHeld) return;
      el._keyHeld = true; el._keyClick = true; el.classList.add('on'); down(id, el);
    });
    const keyUp = (e) => {
      if (e.type !== 'blur' && e.code !== 'Space' && e.code !== 'Enter') return;
      if (!el._keyHeld) return;
      e.preventDefault(); e.stopPropagation(); el._keyHeld = false; el.classList.remove('on');
      if (e.type === 'blur') {
        const p = game.battle?.player;
        if (el.dataset.b === 'atk') { input.leftPressed = false; p?.cancelAttack(); }
        if (el.dataset.b === 'grd') { input.rightPressed = false; if (p) p.guardOn = false; }
        if (el.dataset.b === 'cmd') { T.radialDrag = null; closeRadial(true); }
        if (el.dataset.b === 'use') input.edge.delete('KeyE');
      }
      up(el.dataset.b);
    };
    el.addEventListener('keyup', keyUp);
    el.addEventListener('blur', keyUp);
    el.addEventListener('click', (e) => {
      if (el._cancelClick && e.detail !== 0) { e.stopImmediatePropagation(); e.preventDefault(); return; }
      const id = el.dataset.b;
      if (e.detail === 0 && el._keyClick) { el._keyClick = false; e.preventDefault(); return; }
      if (id && e.detail === 0 && active()) { down(id, el); up(id); }
    });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  });
  // 一時停止は放した時に（間違えて触れても、指をずらせば止めない）
  $('tc-pause').addEventListener('click', () => { if (game.battle && !game.battle.ended && (!game.battle.over || game.battle.withdrawal) && !game.paused) setPause(true); });
  $('tc-map').addEventListener('click', () => { if (active()) toggleBigMap(); });
  // 大地図の縮尺：＋・－の釦と、二本指で拡げる・つまむ
  $('tc-zin').addEventListener('click', () => { if (game.hud && game.hud.zoomBigmap) game.hud.zoomBigmap(-250); });
  $('tc-zout').addEventListener('click', () => { if (game.hud && game.hud.zoomBigmap) game.hud.zoomBigmap(250); });
  const bmP = new Map();
  let bmD = 0;
  const bmMove = (e) => {
    if (!bmP.has(e.pointerId)) return;
    const point = bmP.get(e.pointerId); point.x = e.clientX; point.y = e.clientY;
    if (bmP.size !== 2) return;
    let a, c;
    for (const point of bmP.values()) { if (!a) a = point; else c = point; }
    const d = Math.hypot(a.x - c.x, a.y - c.y);
    if (bmD && game.hud && game.hud.zoomBigmap) game.hud.zoomBigmap((bmD - d) * 6);
    bmD = d;
  };
  document.addEventListener('pointerdown', (e) => { if (e.pointerType === 'mouse' || !(e.target.closest && e.target.closest('#bigmap'))) return; bmP.set(e.pointerId, { x: e.clientX, y: e.clientY }); bmD = 0; }, true);
  document.addEventListener('pointermove', bmMove, true);
  const bmUp = (e) => { bmP.delete(e.pointerId); bmD = 0; };
  document.addEventListener('pointerup', bmUp, true);
  document.addEventListener('pointercancel', bmUp, true);
  // 視点：三人称 ⇄ 一人称（V と同じ）
  $('tc-view').addEventListener('click', () => { if (active()) input.edge.add('KeyV'); });

  // ---- 画面を触る：左は歩く棒、右は見回す ----
  const canvas = document.getElementById('view');
  const active = () => game.battle && game.battle.player?.u.alive && !game.battle.ended && (!game.battle.over || game.battle.withdrawal) && !game.hud?.introWaiting && !game.battle._rts?.on && !game.paused && !game.photo && !game.helpOpen && !game.deployment && document.getElementById('screen').hidden && !T.rotShown;
  // 号令の輪を開いて待っている時は、画面のどこを叩いても（輪の札の上でも）行き先えらびにする
  window.addEventListener('pointerdown', (e) => {
    if (!T.sticky || !active() || (e.target.closest && e.target.closest('#tc, [data-radial-team]'))) return;
    e.preventDefault(); e.stopPropagation();
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* noop */ }
    aimRadial(e.clientX, e.clientY);
    T.looks.set(e.pointerId, { x: e.clientX, y: e.clientY, radial: true });
  }, true);
  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' || !active() || T.looks.has(e.pointerId)) return;
    e.preventDefault();
    // 画面の端から 16px は受けない（iOS の戻る・切り替えのなぞりと取り合わない）
    if (!T.laid || T.lw !== innerWidth || T.lh !== innerHeight) layout();
    if (e.clientX < Math.max(16, T.safeArea.l + 8) || e.clientX > innerWidth - Math.max(16, T.safeArea.r + 8)) return;
    T.kbd = false;
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* noop */ }
    // 左半分の空いている所なら、置いた指の位置から棒を始める。右半分は視点。
    const moveSide = inMoveZone(e.clientX, e.clientY);
    if (moveSide && !T.move) {
      T.moved = true; input.touchMoving = true;
      T.move = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: e.clientX, y: e.clientY };
    } else if (!moveSide && T.looks.size === 0) T.looks.set(e.pointerId, { x: e.clientX, y: e.clientY });
  });
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'mouse' || !active()) return;
    if (T.move && T.move.id === e.pointerId) { T.move.x = e.clientX; T.move.y = e.clientY; return; }
    const l = T.looks.get(e.pointerId);
    if (!l) return;
    if (l.radial) { aimRadial(e.clientX, e.clientY); return; }
    // 指の動きをそのまま視点へ（指はマウスより動きが小さいので少し強める）。
    // 指の分も記録して、視点側でマウスの感度を掛けない。
    const k = S.touchSens || 1;
    // 狙い定めの間は、横に素早く払うと隣の敵へ狙いを替える（PC のホイールと同じ）。一度の払いで一人ずつ
    const pl = game.battle && game.battle.player;
    if (pl && pl.lock && pl.switchLock) {
      const now = performance.now();
      const mv = e.clientX - l.x;
      // 止まったり（0.2秒動かない）逆へ払ったりしたら、数え直す
      if (mv === 0) { l.y = e.clientY; return; }
      if (!l.sw || now - l.swT > 200 || Math.sign(mv) !== Math.sign(l.sw)) { l.sw = 0; l.switched = false; }
      l.swT = now; l.sw += mv;
      if (!l.switched && Math.abs(l.sw) > 64) { l.switched = true; const was = pl.lock; pl.switchLock(Math.sign(l.sw)); if (pl.lock !== was) buzz(12); }
      l.x = e.clientX; l.y = e.clientY;
      return;
    }
    // 鉄砲・弓を構えて狙っている間は見回しを遅く（指で細かく合わせやすく）
    const aimSlow = pl && pl.aiming && (pl.weapon === 'gun' || pl.weapon === 'bow') ? 0.35 : 1;
    const dx = (e.clientX - l.x) * 1.7 * k * aimSlow, dy = (e.clientY - l.y) * 1.5 * k * aimSlow;
    input.dx += dx; input.dy += dy;
    input.touchDx += dx; input.touchDy += dy;
    l.x = e.clientX; l.y = e.clientY;
  });
  const cEnd = (e) => {
    if (T.move && T.move.id === e.pointerId) { T.move = null; input.touchMoving = false; T.axis.x = T.axis.y = 0; if (input.axis === T.axis) input.axis = null; input.runHeld = false; }
    const l = T.looks.get(e.pointerId);
    if (l) {
      T.looks.delete(e.pointerId);
      if (l.radial) {
        const p = game.battle && game.battle.player;
        if (p) { const trace = p.touchRadialTrace || (p.touchRadialTrace = {}); trace.releaseX = Number.isFinite(e.clientX) ? e.clientX : l.x; trace.releaseY = Number.isFinite(e.clientY) ? e.clientY : l.y; trace.cancelled = e.type === 'pointercancel'; if (trace.cancelled) { trace.released = null; trace.accepted = false; } }
        if (e.type !== 'pointercancel') {
          aimRadial(e.clientX, e.clientY);
          // 放した位置は、次の更新で Tab が離れた扱いになる前に決める。
          if (p && p.radialVec && p.flickRadial) {
            p.touchRadialTrace.released = p.touchRadialTrace.selected;
            p.touchRadialTrace.accepted = p.flickRadial(p.radialVec.x + input.dx, p.radialVec.y + input.dy);
          }
        }
        closeRadial(true);
        input.dx = input.dy = input.touchDx = input.touchDy = 0;
      }
    }
    if (T.move === null) T.runLatch = false;
  };
  canvas.addEventListener('pointerup', cEnd);
  canvas.addEventListener('pointercancel', cEnd);
  canvas.addEventListener('lostpointercapture', (e) => cEnd({ type: 'pointercancel', pointerId: e.pointerId }));

  // HUD の札を叩く：選択肢・飛ばす・取る・小地図
  document.addEventListener('click', (e) => {
    if (!active()) return;
    const opt = e.target.closest && e.target.closest('#choice .opt');
    if (opt) { game.battle.pickChoice(Number(opt.dataset.pick)); return; }
    if (e.target.closest && e.target.closest('#skiphint')) { game.battle.skip(); return; }
    if (e.target.closest && e.target.closest('#prompt')) { input.edge.add('KeyE'); return; }
    if (e.target.closest && e.target.closest('#subtitle')) { game.hud.toggleLog(); return; }
    if (e.target.id === 'minimap') toggleBigMap();
  });

  // 組の札（#h-units）を長押しすると、組の兵の頭の上に居場所と名の印を出す（PC の Alt と同じ）。放すと消す
  let unitsHold = null;
  const unitsUp = () => { if (unitsHold) { clearTimeout(unitsHold.t); if (unitsHold.on) { input.keys.delete('AltLeft'); T.eatClick = true; setTimeout(() => { T.eatClick = false; }, 400); } unitsHold = null; } };
  document.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' || !active() || !(e.target.closest && e.target.closest('#h-units'))) return;
    unitsUp();
    unitsHold = { on: false, t: setTimeout(() => { if (!unitsHold || !active()) { unitsUp(); return; } unitsHold.on = true; input.keys.add('AltLeft'); buzz(12); showHint('組の居場所を頭の上に出している（指を放すと消える）'); }, 450) };
  }, true);
  document.addEventListener('pointerup', unitsUp, true);
  document.addEventListener('pointercancel', unitsUp, true);
  window.addEventListener('blur', () => { bmP.clear(); bmD = 0; unitsUp(); reset(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { bmP.clear(); bmD = 0; unitsUp(); reset(); } });
  // 長押しの後の「押した」は、号令先の切り替えにしない
  document.addEventListener('click', (e) => { if (T.eatClick && e.target.closest && e.target.closest('#h-units')) { e.stopPropagation(); e.preventDefault(); T.eatClick = false; } }, true);

  // 手応え：ゲームパッドの振動（打たれた・鉄砲を放った）を、パッドの無い指の端末では本体の震えに替える
  const vib0 = game.vibrate.bind(game);
  // 打たれた（player.js の hurt）・鉄砲を放った（同 0.7・140ms）
  game.vibrate = (s, ms) => { vib0(s, ms); if (!game.pad) haptic(s === 0.7 && ms === 140 ? 'gun' : 'hurt', s || 0.6); };
  T.buzz = buzz; T.showHint = showHint;
  // 戦の外の画面（城下・問屋・地図・一時停止・物語の札）でも、釦や札に触れた時にごく短く震える（押せたと指で分かる）
  document.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' || !e.target.closest || e.target.closest('#tc')) return;
    const el = e.target.closest('button, [role=tab], [role=button], .opt, a[href], select, label');
    if (el && !el.disabled && el.getAttribute('aria-disabled') !== 'true') buzz(5);
  }, true);

  // キーボード・マウスを使い始めたら丸を隠す（iPad にキーボードをつないだ時）
  window.addEventListener('keydown', (e) => { if (game.battle && !e.target.closest?.('#tc, input, textarea, select, [contenteditable]')) T.kbd = true; });
  window.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse') T.kbd = false; }, true);

  // ---- 縦向きの札 ----
  const checkRot = () => {
    const tall = innerHeight > innerWidth * 1.05;
    // 横にしたら「縦のまま続ける」の答えを忘れる（次に縦にした時にもう一度聞く）
    if (!tall) T.rotOk = false;
    // iPad（大きい画面）は縦のままでも遊べる（丸は下にまとまる）
    const show = tall && !T.rotOk && isPhone;
    const wasShown = T.rotShown;
    if (show && !T.rotShown) reset();
    T.rotShown = show;
    rot.hidden = !show;
    if (show && !wasShown) T.rotFocus = document.activeElement;
    if (show && game.battle && !game.battle.ended && (!game.battle.over || game.battle.withdrawal) && !game.paused) setPause(true);
    $('tc-rot-pause').hidden = !game.paused;
    if (show && !wasShown) $('tc-rot-go').focus({ preventScroll: true });
    else if (!show && wasShown) {
      const focus = game.paused ? $('pm-resume') : T.rotFocus;
      if (focus?.isConnected) focus.focus({ preventScroll: true });
    }
  };
  $('tc-rot-go').onclick = () => { T.rotOk = true; T.layoutW = 0; checkRot(); };
  window.addEventListener('resize', () => { if (T.move || T.looks.size || T.held.size || T.sticky || root.querySelector('.on')) reset(); checkRot(); });
  window.addEventListener('orientationchange', () => { reset(); T.safeArea = null; T.layoutW = 0; setTimeout(checkRot, 200); });
  checkRot();
  return T;
}

// 毎フレーム（pollPad の後）呼ぶ：棒の向きを input へ入れ、丸の出し方を決める
export function touchFrame(dt) {
  if (!T) return;
  const { input, game, root, btn } = T;
  const b = game.battle, p = b && b.player;
  if (!T.scr) T.scr = document.getElementById('screen');
  // 上空視点（rts.js）が開いている間は、武器の丸・歩く棒を隠す（下知の釦は hud.js の RTS の帯が出す）。
  // rts.js を import すると touch.js→rts.js→gunbai.js→player.js→touch.js で回ってしまうので、b._rts.on を直に見る
  // 引き上げ中も追手の攻撃は続く。決着だけで棒と釦を消すと、逃げ足も構えも使えなくなる。
  const on = !!(b && !b.ended && (!b.over || b.withdrawal) && !game.paused && !game.deployment && !game.photo && !game.helpOpen && !game.hud?.introWaiting && p?.u.alive && !T.rotShown && !T.kbd && T.scr.hidden && !(b._rts && b._rts.on));
  // 戦が止まったら、押しっぱなしの物を全部放す
  if (!on && T.was) reset();
  if (T.lockSwap !== S.touchSwap) { T.lockSwap = S.touchSwap; T.lockTip = false; }
  if (!b && T.battle) T.battle = null;
  if (on && T.battle !== b) { reset(); clearTimeout(T.lhT); T.battle = b; T.lockTip = false; T.glowId = null; T.coachSwap = null; T.coachTut = null; T.moved = false; T.idleY = 0; T.hookAt = 0; T.zoneAt = 0; }
  // ゲームの外の画面（城下・図鑑・設定）では、ページの拡大を許す（戦の間だけ止める）
  const inGame = on;
  if (T.zoomLock !== inGame) { T.zoomLock = inGame; setZoomLock(inGame); }
  T.was = on;
  if (root.hidden !== !on) root.hidden = !on;
  if (!on) return;
  // 命中の震えは本人の strike から送る。兵同士の止めでは震えない。
  // 初めて狙いを定めた時だけ、相手の替え方を一度出す
  if (p.lock && !T.lockTip) { T.lockTip = true; T.showHint(S.touchSwap ? '画面の左を左右に払うと、狙う相手を替える' : '画面の右を左右に払うと、狙う相手を替える'); }
  // 右下の丸を並べる（安全な余白の中）
  // 城下（町を歩く）では戦の丸を出さない。「入る」の丸を右の親指の真下（突くの場所）へ
  const town = !!(b.def && b.def.town);
  T.town = town;
  if (T.layoutW !== innerWidth || T.layoutH !== innerHeight || T.layoutSwap !== S.touchSwap || T.layoutSize !== S.touchSize || T.layoutAlpha !== S.touchAlpha || T.layoutTown !== town) {
    T.layoutW = innerWidth; T.layoutH = innerHeight; T.layoutSwap = S.touchSwap;
    T.layoutSize = S.touchSize; T.layoutAlpha = S.touchAlpha; T.layoutTown = town;
    layout();
  }
  if (T.hintWeapon !== p.weapon) {
    T.hintWeapon = p.weapon;
    T.showHint(p.weapon === 'gun' ? (S.touchSwap ? '狙うで構える。左をなぞって合わせ、放つで撃つ' : '狙うで構える。右をなぞって合わせ、放つで撃つ') : p.weapon === 'bow' ? '射るを押したままなぞって狙う。放して射る' : '突く・斬るを長押しして放す。指をずらすと取り消して見回す');
  }
  // 歩く棒
  const st = T.stick;
  if (!T.mzone) T.mzone = document.getElementById('tc-mzone');
  tog(T.mzone, 'sw', !!S.touchSwap);
  if (T.move) {
    tog(T.mzone, 'off', true);
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
    T.axis.x = ax; T.axis.y = ay; input.axis = T.axis;
    input.runHeld = run;
    st.classList.remove('idle');
    st.hidden = false;
    st.classList.toggle('run', run);
    st.style.left = T.move.ox + 'px'; st.style.top = T.move.oy + 'px';
    // 走っている時は「走る」と字でも出す（色だけに頼らない）
    setText(st.firstElementChild, p.mounted ? ay > 0.15 ? '後ずさり' : -ay < 0.2 ? '横へ向ける' : -ay < 0.5 ? '並足' : -ay < 0.8 ? '速足' : p.breathRest ? '息切れ・並足で休む' : p.breath < p.maxBreath * 0.25 ? '息が残り少ない' : run ? '駆け足' : '速足' : '走る');
    st.firstElementChild.style.display = run || p.mounted ? 'block' : 'none';
    st.lastElementChild.style.transform = `translate(${(ax * R).toFixed(1)}px, ${(ay * R).toFixed(1)}px)`;
  } else {
    // ゲームパッドが無ければ（axis が空）走りも解く
    if (!input.axis) input.runHeld = false;
    st.classList.add('idle'); st.classList.remove('run');
    // 触れていない時は、初めの30秒（初めての戦は60秒）だけ薄い棒を見せる（あとは景色を隠さない）
    const idleT = b.index === 0 ? 60 : 30;
    st.hidden = b.t >= idleT && !T.glowMove;
    tog(T.mzone, 'off', b.t >= idleT && !T.glowMove);
    // 札の実寸を四分の一秒ごとに測る。棒と上の説明に八点の間を残す。
    if (!(T.idleMeasureT > b.t) || T.idleBattle !== b || T.idleW !== innerWidth || T.idleH !== innerHeight || T.idleSwap !== S.touchSwap) {
      T.idleMeasureT = b.t + 0.25; T.idleBattle = b;
      T.idleW = innerWidth; T.idleH = innerHeight; T.idleSwap = S.touchSwap;
      const sa = T.safeArea;
      T.idleX = S.touchSwap ? innerWidth - 110 - (sa?.r || 0) : 110 + (sa?.l || 0);
      let lower = (sa?.t || 0) + 96, upper = innerHeight - (sa?.b || 0) - 72;
      const bl = document.querySelector('#hud .bl'), tut = document.getElementById('tutorial');
      if (bl && !bl.hidden) {
        const r = bl.getBoundingClientRect();
        if (r.width && r.height && r.left < T.idleX + 72 && r.right > T.idleX - 72) upper = Math.min(upper, r.top - 72);
      }
      if (tut && !tut.hidden) {
        const r = tut.getBoundingClientRect();
        if (r.width && r.height && r.left < T.idleX + 96 && r.right > T.idleX - 96) lower = Math.max(lower, r.bottom + 96);
      }
      T.idleFits = lower <= upper;
      T.idleY = Math.max(lower, Math.min(upper, innerHeight * 0.55));
    }
    // 狭い時は待機の絵だけを隠す。触れて歩く操作はそのまま受ける。
    if (!T.idleFits) st.hidden = true;
    st.style.left = `${T.idleX}px`; st.style.top = `${T.idleY}px`;
    st.lastElementChild.style.transform = '';
    // 初めのうちだけ「左の親指で歩く」の字
    setText(st.firstElementChild, S.touchSwap ? '右の親指で歩く' : '左の親指で歩く');
    st.firstElementChild.style.display = b.t < idleT || T.glowMove ? '' : 'none';
  }
  // 丸の出し入れ（その時に使える物だけ）。突く・構え・回避（馬上は手綱）は戦の間いつも出す
  const hasSq = !!b.squad?.some((o) => o.alive);
  const rid = p.mounted;
  hide(btn.atk, town); hide(btn.grd, town); hide(btn.dodge, town);
  // 馬上は 突く・構え・手綱・降りる（と号令）だけにし、狙い・鼓舞・持ち替えは隠す（丸が七つ並ばないように）
  // 狙いの丸は、敵が近い時（35m）か狙いを定めている時だけ（平時の戦場に丸を並べない）
  const hudR = game.hud, near = !!(hudR && hudR.nearFoe);
  hide(btn.lock, rid || town || !(near || p.lock));
  hide(btn.cmd, !hasSq);
  tog(btn.cmd, 'sel', !!p.radial || T.sticky);
  const wl = p.weaponList ? p.weaponList() : ['spear'];
  // 馬上でも弓・鉄砲へは持ち替えられる（騎射）
  const rangedL = wl.includes('bow') || wl.includes('gun');
  hide(btn.wpn, town || wl.length < 2 || (rid && !rangedL));
  if (!btn.wpn.hidden) { const nx = wl[(wl.indexOf(p.weapon) + 1) % wl.length]; setText(btn.wpn.firstChild, { spear: '槍へ', sword: '刀へ', gun: '鉄砲へ', bow: '弓へ' }[nx]); }
  // 鉄砲・弓を持っている時：突く→放つ／射る、構え→狙う。鉄砲は込め直しの進みを丸の縁に、込め終えて狙っていれば光る
  const gunW = p.weapon === 'gun', bowW = p.weapon === 'bow';
  setText(btn.atk.firstChild, gunW ? '放つ' : bowW ? '射る' : p.weapon === 'sword' ? '斬る' : '突く');
  setText(btn.grd.firstChild, gunW || bowW ? '狙う' : p.guardOn ? '解く' : '構える');
  const sub = btn.atk.querySelector('small');
  // 本体と同じ気力・溜め・構えの順で、離した時に出る技を予告する。
  const blade = !gunW && !bowW, kind = blade ? p.previewMeleeKind() : '';
  const tech = kind === 'sweep' && p.jumonji ? '離して薙ぐ' : MELEE_LABEL[kind] || (blade ? '気力不足' : '');
  if (sub) setText(sub, gunW ? (rid ? '降りて放つ' : p.gunLoaded ? '狙って放つ' : p.gunAmmo === 0 ? '弾がない' : p.knockT > 0 || p.staggerT > 0 ? '体勢を戻す' : Math.hypot(p.u.vel.x, p.u.vel.z) >= 0.3 ? '止まって込める' : '込め中') : bowW ? (p.bowAmmo <= 0 ? '矢がない' : p.draw >= 2 ? (p.bowHold > 3 ? '腕が疲れる' : '離して射る') : p.draw >= 0.6 ? '引き絞る' : p.draw > 0 ? '矢を番える' : '押して引く') : input.mouseL ? tech : '長押しで溜め');
  // 狙うだけでは放たない。放つの丸を押すことを伝える。
  { let gs = btn.grd.querySelector('small'); const t = gunW && p.gunLoaded ? (rid ? '降りて放つ' : '放つを押す') : bowW ? (p.guardOn ? 'もう一度で解く' : '押して保つ') : p.guardBroken > 0 ? '体勢を戻す' : p.sta <= 0 ? '気力不足' : p.guardOn ? 'もう一度で解く' : '押して保つ';
    if (t && !gs) { gs = document.createElement('small'); btn.grd.appendChild(gs); } if (gs) setText(gs, t); }
  tog(btn.atk, 'tech', !!tech && tech !== '長押しで溜め');
  tog(btn.atk, 'rl', gunW && !p.gunLoaded);
  tog(btn.atk, 'ready', gunW && p.gunLoaded && (p.aimK || 0) > 0.5);
  if (gunW && !p.gunLoaded) btn.atk.style.setProperty('--rl', `${Math.round((p.gunReload || 0) * 100)}%`);
  // 陣形・射撃の丸は、号令の輪を開いている間だけ（射撃は弓・鉄砲の組がいる時）
  // 鉄砲の組がいる時は「構え」「放て」（8キー）の丸をいつも出す（輪を開かずに一斉射まで）
  const rOpen = hasSq && (!!p.radial || T.sticky);
  let back = T.choiceBack;
  if (!back) { back = document.createElement('div'); back.className = 'choice-back'; back.style.cssText = 'position:absolute;top:calc(8px + env(safe-area-inset-top));left:50%;transform:translateX(-50%);font-size:12px;color:#ece4d2;background:rgba(20,18,15,.9);padding:4px 8px;pointer-events:none'; root.appendChild(back); T.choiceBack = back; }
  const choice = document.getElementById('choice');
  back.hidden = !rOpen || !choice || choice.hidden;
  if (!back.hidden) setText(back, '輪を閉じると判断の札に戻る');
  let gunSq = false, bowSq = false;
  const groups = b.squadGroups;
  const selectedKind = p.selGroup !== 'all' && groups.some((g) => g.kind === p.selGroup) ? p.selGroup : 'all';
  if (hasSq) for (const g of groups) {
    if (g.count <= 0 || (selectedKind !== 'all' && g.kind !== selectedKind)) continue;
    if (g.kind === 'gun') gunSq = true;
    if (g.kind === 'bow') bowSq = true;
  }
  hide(btn.form, !rOpen || b.G.rank < 1);
  hide(btn.fire, !gunSq && (!rOpen || b.G.rank < 1 || !bowSq));
  setText(btn.fire.firstChild, gunSq ? (b.kamae ? '放て' : '構え') : '射撃');
  btn.fire.setAttribute('aria-label', gunSq ? (b.kamae ? '鉄砲の組、放て' : '鉄砲の組、構え') : '弓の射撃');
  tog(btn.fire, 'sel', !!(gunSq && b.kamae));
  // 空馬の手綱を取れる時は、乗り降りの丸を「手綱」にして必ず出す
  hide(btn.mount, town || (!rid && !p.canRide && !p.takeO));
  const horseH = p.horse?.userData.horse, catchP = p.catching ? Math.min(1, p.catching.t / (p.catching.dur)) : b.holdId === 'horse-take' ? b.holdPct || 0 : 0;
  setSub(btn.mount, p.mountT > 0 ? (rid ? '乗っている途中' : '降りている途中') : rid ? p.horseStopUntil > b.t || horseH?.refuseUntil > b.t ? `${horseH?.refuseReason || '危険'}を避ける` : horseH?.fear > 0.5 ? '怯えている' : horseH?.exhausted || p.hfat >= 0.85 ? '疲れて歩く' : p.breathRest || p.breath <= 5 ? '息切れ・並足で休む' : p.horseHp < p.horseMax * 0.5 ? '傷で足が鈍る' : '馬を降りる' : catchP > 0 ? `あと${Math.max(1, Math.ceil(p.catching ? (p.catching.dur) - p.catching.t : (1 - catchP) * 1.5))}秒` : p.u.climb ? '登っている' : p.loose?.mode === 'come' ? 'こちらへ来ている' : p.loose?.mode === 'flee' ? '逃げる先を追う' : p.loose?.mode === 'fled' ? '空馬を探す' : horseH?.fear > 0.5 ? '怯えて呼べない' : p.spoil ? '口笛では来ない' : horseH?.exhausted || p.hfat >= 0.85 ? '疲れて歩いて来る' : 'そばへ寄る');
  const catchWhy = catchP > 0 ? 'もう一度押すか、離れると手綱を放す' : '';
  if (btn.mount.getAttribute('aria-description') !== catchWhy) btn.mount.setAttribute('aria-description', catchWhy);
  let mountCh = btn.mount._chg;
  if (!mountCh) { mountCh = document.createElement('span'); mountCh.className = 'chg'; mountCh.hidden = true; btn.mount.appendChild(mountCh); btn.mount._chg = mountCh; }
  mountCh.hidden = catchP <= 0; if (catchP > 0) mountCh.style.setProperty('--p', `${Math.round(catchP * 100)}%`);
  setText(btn.mount.firstChild, rid ? '降りる' : p.takeO && !p.takeO.kept ? '手綱' : p.loose?.mode === 'flee' ? '逃げる' : p.loose?.mode === 'fled' ? '逃げた' : p.loose && Math.hypot(p.loose.x - p.u.pos.x, p.loose.z - p.u.pos.z) >= 3.2 ? (p.spoil ? '寄る' : '呼ぶ') : '乗る');
  // 「取る」の丸：案内の札（#prompt）の代わりに、何を取るかを丸の下に書く
  if (!T.pr) T.pr = document.getElementById('prompt');
  const pr = T.pr;
  const canUse = !!pr && !pr.hidden;
  hide(btn.use, !canUse);
  const promptText = canUse ? pr.textContent : '';
  if (canUse && (T.promptText !== promptText || T.promptTown !== town)) {
    T.promptText = promptText; T.promptTown = town;
    let tx = '';
    for (let n = pr.firstChild; n; n = n.nextSibling) if (n.nodeName !== 'KBD') tx += n.textContent;
    tx = tx.replace(/\b(?:Key|Digit)[A-Za-z0-9]+\b/g, '').replace(/\b[A-Z]\b/g, '');
    tx = tx.replace(/^\s*(押して：)?/, '').trim();
    // 丸に収まる短い字：「柵を引き倒す」「源八と話す」→ を・と の後の動きだけ。長ければ四字まで。前の名は small へ
    // 「を」を先に見る（「梯子を突き落とす」の「落とす」の と で切らない）
    // 「話す　町人」のように動き・全角の間・相手の名の形もある（城下の札）。その時は前を動き、後ろを名に
    const sp = tx.indexOf('　');
    const pIdx = sp > 0 ? -1 : tx.lastIndexOf('を') >= 0 ? tx.lastIndexOf('を') : tx.lastIndexOf('と');
    const vb = sp > 0 ? tx.slice(0, sp) : pIdx >= 0 ? tx.slice(pIdx + 1) : tx;
    const nameEl = sp > 0 ? tx.slice(sp + 1).trim() : pIdx >= 0 ? tx.slice(0, pIdx) : '';
    // 長い動きは、丸に収まる言い方へ（押して歩く→押す・突き落とす→落とす）。それでも長ければ四字まで
    const vb1 = vb.replace(/（[^）]*）/g, '').trim();   // 「（長押し）」などの添え書きは丸に入れない
    const vb2 = ({ 押して歩く: '押す', 突き落とす: '落とす', 引き倒す: '倒す', 馬を捕らえて乗る: '乗る', 捕らえて乗る: '乗る', 話を聞く: '聞く', 火を付ける: '燃やす' })[vb1] || vb1;
    const short = vb2;
    let sm = btn.use.querySelector('small');
    if (!sm) { sm = document.createElement('small'); btn.use.appendChild(sm); }
    // 丸そのものには「入る」「話す」「拾う」など動きを大きく書く（城下も戦の中も同じ）。相手の名は下の small へ
    setText(btn.use.firstChild, short || (town ? '入る' : '取る'));
    setText(sm, town ? nameEl.slice(0, 6) : /（長押し）/.test(tx) ? '長押し' : nameEl);   // 長押しの要る物は、丸の下に「長押し」
    btn.use.setAttribute('aria-label', tx || '取る');
  }
  if (!canUse) T.promptText = null;
  // 話す・渡すなど、いま押せる事は金の縁で目立たせる（見落として立ち尽くさないように）
  tog(btn.use, 'ready', canUse && !town);
  tog(btn.lock, 'sel', !!p.lock);
  // 平時は狙いと鼓舞の丸を薄く（隠すと押したい時に見つからないので、隠さずに控えめに）
  const calm = game.hud && game.hud.root.classList.contains('calm') && !p.lock;
  tog(btn.lock, 'quiet', calm);
  tog(btn.rally, 'quiet', calm);
  { const v = document.getElementById('tc-view'), fp = S.view === 'first';
    const viewName = fp ? '一人称' : S.camRange === 'near' ? '近い視点' : S.camRange === 'far' ? '遠い視点' : '普通の視点';
    if (v.getAttribute('aria-label') !== `視点を替える（今は${viewName}）`) v.setAttribute('aria-label', `視点を替える（今は${viewName}）`);
    tog(v, 'sel', fp); if (v.getAttribute('aria-pressed') !== String(fp)) v.setAttribute('aria-pressed', String(fp)); }
  setText(btn.lock.firstChild, p.lock ? '解除' : '狙い');
  tog(btn.grd, 'sel', !!p.guard || !!p.aiming);
  tog(btn.dodge, 'dim', (!p.mounted && p.sta < 20));
  setText(btn.dodge.firstChild, p.mounted ? '引く' : '回避');
  setSub(btn.dodge, p.mounted ? '手綱を引いて緩める' : p.u.climb ? '登っている' : p.knockT > 0 ? '起き上がる' : p.sta < 20 ? '気力不足' : p.dodgeT > -0.3 ? `あと${Math.max(1, Math.ceil(p.dodgeT + 0.3))}秒` : '気力を使う');
  const rd = p.rallyCd || 0;
  // 鼓舞・鬨の声は、戦っている時（敵が近い・斬り合い・狙われている）だけ。一字の「鬨」では分からないので三字で
  const fightNow = near || p.inCombatT > 0 || (b.army.threats || []).length > 0;
  hide(btn.rally, rid || town || !fightNow);
  setText(btn.rally.firstChild, hasSq ? '鼓舞' : '鬨の声');
  tog(btn.rally, 'dim', rd > 0);
  setSub(btn.rally, rd > 0 ? `あと${Math.ceil(rd)}秒` : '声を上げる');
  let cd = btn.rally.querySelector('.cd');
  if (rd > 0) { if (!cd) { cd = document.createElement('span'); cd.className = 'cd'; btn.rally.appendChild(cd); } cd.style.setProperty('--p', Math.min(100, rd / 25 * 100).toFixed(0) + '%'); cd.hidden = false; } else if (cd) cd.hidden = true;
  // 弓は二秒、近接は〇・七秒で内縁が満ちる。槍の二段目だけ角のある外縁を足す。
  let ch = btn.atk._chargeRing;
  if (!ch) { ch = document.createElement('span'); ch.className = 'chg'; btn.atk.appendChild(ch); btn.atk._chargeRing = ch; }
  const charge = blade && input.mouseL ? p.chargeT || 0 : 0;
  const cT = bowW ? Math.min(1, p.draw / 2) : Math.min(1, charge / 0.7);
  ch.hidden = cT <= 0;
  if (cT > 0) { ch.style.setProperty('--p', (cT * 100).toFixed(0) + '%'); tog(ch, 'full', cT >= 1); }
  let second = btn.atk._secondRing;
  if (!second) { second = document.createElement('span'); second.className = 'chg second'; btn.atk.insertBefore(second, ch); btn.atk._secondRing = second; }
  second.hidden = p.weapon !== 'spear' || charge <= 0.7;
  if (!second.hidden) { second.style.setProperty('--p', (Math.min(1, (charge - 0.7) / 0.7) * 100).toFixed(0) + '%'); tog(second, 'full', charge > 1.4); }
  // 長押しで取る物と、号令の輪を開くまでの待ちも縁で示す。
  for (const id of HOLD_RING_BTNS) {
    const el = btn[id];
    let ring = el._holdRing;
    if (!ring) { ring = document.createElement('span'); ring.className = 'chg'; el.appendChild(ring); el._holdRing = ring; }
    const progress = id === 'use' ? (T.held.has(id) ? b.holdPct || 0 : 0) : (T.held.has(id) ? Math.min(1, (p.tabT || 0) / 0.22) : 0);
    ring.hidden = progress <= 0;
    if (progress > 0) ring.style.setProperty('--p', `${Math.round(progress * 100)}%`);
  }
  // 低い画面（スマホ横）では、右下の丸は六つまで（突く・構え・回避・号令・取る・狙いの順。馬上は乗り降り、鉄砲持ちは持替を先に）。
  // 残り（鼓舞・持ち替え・乗り降り）は「…」の丸に畳み、押すと開く。号令の間は組の札を出す印も付ける
  // 馬上・空馬の手綱を取れる時は「降りる／手綱」を狙いより先に（畳むと馬を降りられなくなる）。
  // 鉄砲・弓を持てる時は「持替」を鼓舞より先に（鉄砲へ持ち替えるのに「…」を開かなくて済む）
  // 降りた馬がすぐそば（乗れる所）にいる時も「乗る」を先に（畳むと、降りた後にすぐ乗り直せない）
  const L = p.loose, nearHorse = !rid && p.canRide && L && L.mode !== 'fled' && Math.hypot(L.x - p.u.pos.x, L.z - p.u.pos.z) < 3.2;
  // 狙いは主な操作なので畳まない。残る枠は手綱・持替・組の射撃を状況に合わせて先に
  const order = rid || p.takeO || nearHorse ? ORDER_HORSE : rangedL ? ORDER_RANGED : ORDER_FOOT;
  const want = T.want; want.length = 0;
  for (const id of order) if (!btn[id].hidden) want.push(id);
  // 六つまでは右下に並べても重ならない（七つ目から「…」に畳む）
  // iPad も同じ（丸が多いと戦場の右下が釦で埋まる）
  const fold = T.fold; fold.length = 0;
  for (let i = 6; i < want.length; i++) fold.push(want[i]);
  for (const id of fold) hide(btn[id], !T.more);
  if (!fold.length) T.more = false;
  hide(btn.more, !fold.length);
  tog(btn.more, 'sel', !!T.more);
  let foldKey = '';
  for (const id of fold) foldKey += (foldKey ? '・' : '') + btn[id].firstChild.textContent;
  if (T.foldKey !== foldKey) { T.foldKey = foldKey; T.foldNames = foldKey; }
  setSub(btn.more, T.more ? '閉じる' : T.foldNames);
  btn.more.setAttribute('aria-description', T.foldNames);
  if (btn.more.title !== '鼓舞・武器の持ち替え・馬の追加操作を開く') btn.more.title = '鼓舞・武器の持ち替え・馬の追加操作を開く';
  if (T.more && !T.held.size && !root.querySelector('.on') && (T.moreT = (T.moreT || 0) + dt) > 6) T.more = false;
  for (const id of LABEL_BTNS) {
    const el = btn[id], label = el.firstChild.textContent + (el.querySelector('small')?.textContent ? '、' + el.querySelector('small').textContent : '');
    if (el.getAttribute('aria-label') !== label) el.setAttribute('aria-label', label);
  }
  for (const id of TOGGLE_BTNS) {
    const el = btn[id], pressed = String(el.classList.contains('sel'));
    if (el.getAttribute('aria-pressed') !== pressed) el.setAttribute('aria-pressed', pressed);
  }
  tog(document.documentElement, 'tc-cmd', !!(p.radial || T.sticky || p.cmdOpen));
  // 大地図を開いている間だけ、縮尺の釦を出す
  const bm = !!(game.hud && game.hud.bigmap);
  hide(document.getElementById('tc-zin'), !bm); hide(document.getElementById('tc-zout'), !bm);
  // 初めての手ほどき：いま試す操作の丸を光らせる（歩く・見回すは棒と画面の右に字）
  measureMoveZone(b.t);
  coachGlow(b);
  if (T.radialDrag && p.radial) feedDrag(T.radialDrag);
  // 号令の輪：開いたまま待っている時は、放っておくと閉じる
  if (T.sticky && !input.keys.has('Tab')) T.sticky = false;
  if (T.sticky && !T.held.size && !T.looks.size) {
    T.stickyT = (T.stickyT || 0) + dt;
    if (T.stickyT > 8) { reset(); return; }
  } else T.stickyT = 0;
  if (!T.hint.hidden) { T.hintT -= dt; if (T.hintT <= 0) { if (p.radial || T.sticky) { setText(T.hint, '真ん中で閉じる'); } else T.hint.hidden = true; } }
}

// 毎コマ同じ値を書き直さない（書くたびに画面の組み直しが起きて、古い端末で重くなる）
// 歩く棒の効く所（左半分。左利きの入れ替えでは右半分）
// 丸の実寸から、歩き始めの範囲を四分の一秒ごとに更新する。
function measureMoveZone(t) {
  if (T.zoneAt > t) return;
  T.zoneAt = t + 0.25;
  const sa = T.safeArea, sw = !!S.touchSwap;
  T.zoneLeft = Math.max(16, sa.l + 8); T.zoneRight = innerWidth - Math.max(16, sa.r + 8);
  T.zoneTop = sa.t; T.zoneBottom = innerHeight - sa.b - 8;
  for (let i = 0; i < BTN.length; i++) {
    const el = T.btn[BTN[i].id], r = T.zoneRects[i]; r.on = !el.hidden;
    if (!r.on) continue;
    const box = el.getBoundingClientRect();
    r.left = box.left - 8; r.right = box.right + 8; r.top = box.top - 8; r.bottom = box.bottom + 8;
  }
  if (sw) T.zoneLeft = innerWidth / 2; else T.zoneRight = innerWidth / 2;
  for (const r of T.zoneBlocks) {
    r.on = !!r.el && !r.el.hidden && r.el.scrollHeight > r.el.clientHeight + 1;
    tog(r.el, 'tc-scroll', r.on); if (!r.on) continue;
    const box = r.el.getBoundingClientRect(); r.on = box.width > 0 && box.height > 0;
    r.left = box.left - 8; r.right = box.right + 8; r.top = box.top - 8; r.bottom = box.bottom + 8;
  }
  const zone = document.getElementById('tc-mzone');
  zone.style.left = T.zoneLeft + 'px'; zone.style.right = 'auto'; zone.style.top = T.zoneTop + 'px'; zone.style.bottom = 'auto';
  zone.style.width = Math.max(0, T.zoneRight - T.zoneLeft) + 'px'; zone.style.height = Math.max(0, T.zoneBottom - T.zoneTop) + 'px';
  const hint = document.getElementById('tc-move-hint');
  hint.hidden = !!T.moved || T.zoneRight - T.zoneLeft < 120;
  setText(hint, sw ? '右の好きな所から歩く' : '左の好きな所から歩く');
  hint.style.left = (T.zoneLeft + 8) + 'px'; hint.style.top = Math.max(T.zoneTop + 8, innerHeight * 0.55) + 'px';
  hint.style.maxWidth = Math.max(0, T.zoneRight - T.zoneLeft - 32) + 'px';
}
function inMoveZone(x, y) {
  measureMoveZone(T.game.battle.t);
  for (const r of T.zoneRects) if (r.on && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return false;
  for (const r of T.zoneBlocks) if (r.on && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return false;
  return x >= T.zoneLeft && x <= T.zoneRight && y >= T.zoneTop && y <= T.zoneBottom;
}
function setSub(el, text) {
  let sub = el._sub;
  if (!sub) { sub = el.querySelector('small'); if (!sub) { sub = document.createElement('small'); el.appendChild(sub); } el._sub = sub; }
  setText(sub, text);
}
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
  if (T.glowId === id && T.coachSwap === S.touchSwap && T.coachTut === t) return;
  T.glowId = id; T.coachSwap = S.touchSwap; T.coachTut = t;
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
  T.input.dx = d.vx * k - p.radialVec.x; T.input.dy = d.vy * k - p.radialVec.y;
  T.input.touchDx = T.input.touchDy = 0;
}

function reset() {
  const { input } = T;
  const p = T.game.battle?.player;
  if (p) { p.cancelAttack(); p.guardOn = p.guard = p.aiming = p.u.guard = false; p.sdx = p.sdy = p.tdx = p.tdy = 0; p.radial = p.radialKeyboard = p.cmdOpen = false; p.tabT = null; p.radialSel = p.radialPreview = -1; p.vHeld = null; p.overHold = false; }
  input.mouseL = input.mouseR = false; input.touchGuardToggle = false; input.touchMoving = false;
  input.leftPressed = input.rightPressed = input.lockPressed = false;
  input.keys.delete('Tab'); input.keys.delete('KeyE'); input.keys.delete('AltLeft');
  input.runHeld = false; input.axis = null; input.dx = input.dy = input.touchDx = input.touchDy = 0;
  for (const key of TOUCH_EDGES) input.edge.delete(key);
  T.runLatch = false; T.more = false; T.moreT = 0; T.stickyT = 0; T.axis.x = T.axis.y = 0;
  document.documentElement.classList.remove('tc-cmd');
  T.move = null; T.looks.clear(); T.held.clear(); T.sticky = false; T.radialDrag = null;
  T.root.querySelectorAll('.tb').forEach((el) => { el.classList.remove('on'); el._o = null; el._keyHeld = false; el._cancelClick = true; });
  if (T.hint) T.hint.hidden = true;
  if (T.stick) T.stick.hidden = true;
}

// 右下の丸・左上の釦を、画面の大きさと安全な余白に合わせて並べる
function layout() {
  T.laid = true; T.lw = innerWidth; T.lh = innerHeight; T.zoneAt = 0;
  // env() は JS から直接読めないので、見えない物で測る
  let probe = document.getElementById('tc-probe');
  if (!probe) {
    probe = document.createElement('div');
    probe.id = 'tc-probe';
    probe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;left:0;top:0;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';
    document.body.appendChild(probe);
  }
  if (!T.safeArea || T.safeW !== innerWidth || T.safeH !== innerHeight) {
    const ps = getComputedStyle(probe);
    T.safeArea = { t: parseFloat(ps.paddingTop) || 0, r: parseFloat(ps.paddingRight) || 0, b: parseFloat(ps.paddingBottom) || 0, l: parseFloat(ps.paddingLeft) || 0 };
    T.safeW = innerWidth; T.safeH = innerHeight;
  }
  const sa = T.safeArea;
  // 画面が大きい（iPad）なら丸も少し大きく。設定の丸の大きさ（小・中・大）も掛ける
  const big = Math.min(innerWidth, innerHeight) >= 700;
  let k = (big ? 1.18 : 1) * ({ s: 0.88, m: 1, l: 1.14 }[S.touchSize] || 1);
  if (T.rotOk && innerHeight > innerWidth * 1.05) {
    const available = innerWidth - sa.l - sa.r - 32;
    // 主な丸は64点、間は12点。狭い縦画面では大きな丸だけ縮める。
    let lo = 0, hi = k;
    for (let i = 0; i < 12; i++) {
      const mid = (lo + hi) / 2;
      const width = Math.max(64, Math.ceil(84 * mid)) + Math.max(64, Math.ceil(64 * mid)) + Math.max(44, Math.ceil(56 * mid)) + Math.max(44, Math.ceil(48 * mid)) + 36 + Math.ceil(12 * mid);
      if (width <= available) lo = mid; else hi = mid;
    }
    k = lo;
  }
  // 丸どうしはどの大きさでも12点以上あける。
  const gap = 12;
  // 左利きの入れ替え：丸は左下、歩く棒は右へ（丸の並びも左右を裏返す）
  const sw = !!S.touchSwap;
  // 列と段の幅は配置を変える時だけ計算する。
  const cols = [0, 0, 0, 0], rows = [0, 0, 0];
  for (const d of BTN) {
    const s = Math.ceil(Math.max(d.id === 'atk' || d.id === 'grd' || d.id === 'dodge' ? 64 : 44, d.d * k));
    cols[d.col] = Math.max(cols[d.col], s);
    rows[d.row] = Math.max(rows[d.row], s);
  }
  const xs = [0], ys = [0];
  for (let i = 1; i < cols.length; i++) xs[i] = xs[i - 1] + cols[i - 1] + gap + (i === 1 ? Math.ceil(12 * k) : 0);
  for (let i = 1; i < rows.length; i++) ys[i] = ys[i - 1] + rows[i - 1] + gap + (i === 1 ? Math.ceil(12 * k) : 0);
  const edge = sw ? sa.l + 16 : innerWidth - sa.r - 16;
  const bottom = innerHeight - sa.b - 16;
  // 配置を変えた時だけ、札が避ける丸の領域を伝える。大きい丸・左利きにも合わせる。
  const controlsWidth = xs[3] + cols[3] + 24;
  document.documentElement.style.setProperty('--battle-controls-top', (bottom - ys[2] - rows[2] - 2) + 'px');
  document.documentElement.style.setProperty('--battle-controls-width', controlsWidth + 'px');
  for (const d0 of BTN) {
    // 城下では「入る」の丸を、突くの場所に突くの大きさで置く（親指の真下）
    const d = T.town && d0.id === 'use' ? { ...d0, col: 0, row: 0, d: 84 } : d0;
    const el = T.btn[d.id];
    if (d.id === 'use') el.classList.toggle('big', !!T.town);
    const s = Math.ceil(Math.max(d.id === 'atk' || d.id === 'grd' || d.id === 'dodge' ? 64 : 44, d.d * k)); // 押せる所は 44px 以上を必ず確保
    el.style.width = el.style.height = s + 'px';
    // 攻めを頂点に、構えと回避を少し内側へ寄せた親指の弧。
    const arc = d.id === 'grd' || d.id === 'dodge' ? 12 * k : 0;
    const x = xs[d.col] + (cols[d.col] - s) / 2 + (d.id === 'grd' ? arc : 0);
    el.style.left = (sw ? edge + x : edge - x - s).toFixed(0) + 'px';
    el.style.top = (bottom - ys[d.row] - (rows[d.row] + s) / 2 - (d.id === 'dodge' ? arc : 0)).toFixed(0) + 'px';
  }
  // 丸の透け具合（設定）
  T.root.style.opacity = '';
  // 透けるのは武器の丸だけ。止める・地図・案内の字は薄くしない。
  T.root.style.setProperty('--tc-bg', String(0.58 * Math.max(0, Math.min(1, S.touchAlpha ?? 1))));
  for (const d of BTN) T.btn[d.id].style.opacity = '';
  const pz = document.getElementById('tc-pause'), mp = document.getElementById('tc-map'), vw = document.getElementById('tc-view');
  // 高さの低い画面（携帯の横向き）では、止める・地図・視点を横に並べる（縦に並べると上の札を右へ押しやる）
  // 携帯の横向き：画面の高さが低い時と、端末の画面そのものが小さい時（ページを縮めて見ていて CSS の高さが 500 を超える時も、指で触るのは同じ小さな画面）
  const low = innerHeight < 500 || Math.min(screen.width || 9999, screen.height || 9999) < 500;
  document.documentElement.classList.toggle('tc-low', low);
  document.documentElement.classList.toggle('tc-sw', !!S.touchSwap);
  // 枠の中なら、アプリの丸（上端から 70px ほど）の下から並べる
  const FT = document.documentElement.classList.contains('inframe') ? 64 : 0;
  const L0 = Math.max(16, sa.l + 12), T0 = Math.max(sa.t, FT) + (low ? 8 : 10);
  const zi = document.getElementById('tc-zin'), zo = document.getElementById('tc-zout');
  if (low) {
    pz.style.top = mp.style.top = vw.style.top = T0 + 'px';
    pz.style.left = L0 + 'px'; mp.style.left = (L0 + 56) + 'px'; vw.style.left = (L0 + 112) + 'px';
    zi.style.top = zo.style.top = T0 + 'px'; zi.style.left = (L0 + 168) + 'px'; zo.style.left = (L0 + 224) + 'px';
  } else {
    zi.style.left = zo.style.left = L0 + 'px'; zi.style.top = (T0 + 168) + 'px'; zo.style.top = (T0 + 224) + 'px';
    pz.style.left = mp.style.left = vw.style.left = L0 + 'px';
    pz.style.top = T0 + 'px';
    mp.style.top = (T0 + 56) + 'px';
    vw.style.top = (T0 + 112) + 'px';
  }
}
