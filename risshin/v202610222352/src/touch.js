import { simpleControls } from './simple_controls.js';
// 触る操作（携帯・iPad）
// 左の親指：触れた所に出る浮かぶ棒で歩く（端の外まで倒すと走る）
// 右側をなぞる：視点。右下の丸：突く（押すだけ）・構える・回避・号令の輪・鼓舞・狙い・持ち替え・乗り降り・取る
// 左上：一時停止と戦術地図。PC（触らない端末）では何も出さない
import { VIEW } from './viewport.js';
import { S, reduceMotion } from './settings.js';
import { navigationEnemy } from './mission_guide.js';

// 主な指し物が指か。最初に指で触れた時も更新し、ほかの画面へ伝える。
const phoneViewport = () => innerWidth > innerHeight && innerWidth <= 1000 && innerHeight <= 500;
export let isTouch = typeof window !== 'undefined' && matchMedia('(any-pointer: coarse)').matches;
// 指の操作を教えるのは稲生と桶狭間だけ。
const coachAllowed = (battle) => battle?.def.key === 'inou' || battle?.def.key === 'okehazama';
export function touchMoveLearned(battle) { return !!T && T.battle === battle && !!T.moveLearned; }   // 10/22：指の操作の前（T が空）に呼ばれて稲生が始まらなかった
// 携帯か（短い辺が 600px 未満）
let isPhone = isTouch && (Math.min(screen.width, screen.height) < 600 || phoneViewport());

// 触る端末の札と描く回数の既定。画質は main.js が実測で決める。
// 端末ごとの初期値と保存値の検査は settings.js にまとめる。

const CSS = `
/* 指の案内中は、同じ動きを促す札と矢印を重ねない。旗と任務は残す。 */
html.touch body #hud.touch-swipe-coach :is(.escape-card,.escape-turn,.escape-gesture) { visibility:hidden !important; }
/* 待機地点へ動く手ほどきの間は操作を一枚にし、着いたら待つ札へ戻す。 */
html.touch body #hud.touch-travel-coach #battle-notices #objectives:not(.expand):not([hidden]):not(.notice-muted) { visibility:hidden !important; }
#tc .action-coach.swipe-coach { width:168px; max-width:168px; height:96px; padding:0; background:none; text-align:center; }
#tc .action-coach.swipe-coach span { display:block; padding:4px 6px; background:#14120f; border-radius:6px; font-size:16px; }
#tc .action-coach.swipe-coach svg { left:66px; top:46px; width:32px; height:40px; }
#tc .action-coach { position:absolute; display:flex; align-items:center; gap:8px; max-width:212px; padding:8px; background:#14120f; color:#fff3ce; font-size:16px; white-space:pre-line; word-break:keep-all; overflow-wrap:normal; font-weight:700; line-height:1.4; pointer-events:none; border-radius:6px; }
#tc .action-coach[hidden] { display:none; }
#tc .action-coach.turn-coach { display:block; width:220px; max-width:220px; height:132px; padding:0; background:none; font-size:16px; white-space:pre-line; text-align:center; }
#tc .action-coach.turn-coach span { display:block; padding:6px 4px; background:#14120f; border-radius:6px; }
#tc .action-coach.turn-coach svg { position:absolute; left:86px; top:52px; width:48px; height:60px; overflow:visible; }
#tc .action-coach.move-coach { width:220px; height:132px; }
#tc .action-coach.enemy-turn-coach span { white-space:pre-line; }
#tc .action-coach.enemy-turn-coach svg { top:76px; }
/* 説明と指の絵を、実際になぞる側の同じ札にまとめる。 */
#tc .action-coach.turn-coach span { position:relative; padding:6px 10px; font-size:16px; }
#tc .action-coach.move-coach svg { left:86px; top:70px; }
#tc .action-coach.route-coach { width:220px; max-width:220px; height:116px; font-size:16px; }
#tc .action-coach.route-coach span { padding:4px; }
#tc .action-coach.route-coach svg { left:86px; top:54px; width:32px; height:40px; }
#tc .action-coach.route-coach.move-coach svg { left:86px; top:58px; }
@keyframes move-finger { 0%,100% { translate:0 0; } 65% { translate:0 -32px; } }
body.rm #tc .action-coach.move-coach svg { animation:none; }
@media (prefers-reduced-motion:reduce) { #tc .action-coach.move-coach svg { animation:none; } }
#tc .action-coach .turn-arrow { display:none; }
#tc .action-coach.turn-coach .turn-arrow { display:block; }
#tc .action-coach .turn-touch { display:none; }
#tc .action-coach.turn-coach .turn-touch { display:block; }
#tc .action-coach.enemy-turn-coach .coach-finger { animation:turn-finger 1.8s ease-in-out infinite; }
@keyframes turn-finger { 0%,20%,100% { transform:translateX(0); } 65%,85% { transform:translateX(var(--turn-shift,40px)); } }
body.rm #tc .action-coach.enemy-turn-coach .coach-finger { animation:none; }
@media (prefers-reduced-motion:reduce) { #tc .action-coach.enemy-turn-coach .coach-finger { animation:none; } }
html.touch body #hud.touch-turn-coach #battle-notices #objectives:not(.expand) { display:none !important; }
#tc .action-coach.opening-coach { width:max-content; max-width:240px; font-size:18px; white-space:pre-line; }
#tc .action-coach svg { flex:0 0 28px; width:28px; height:36px; }
#tc .action-coach.at-button { white-space:pre-line; width:212px; min-height:56px; box-sizing:border-box; }
#tc .action-coach.at-button svg { position:absolute; right:-36px; top:10px; transform:rotate(90deg); }
#tc .action-coach.at-button.sw svg { right:auto; left:-36px; transform:rotate(-90deg); }
#tc .action-coach.attack-only { white-space:pre-line; font-size:16px; }
#tc .action-coach.control-only { padding:0; width:36px; height:48px; background:none; }
#tc .action-coach.control-only span { display:none; }
#tc .action-coach.control-only svg { width:36px; height:48px; transform:rotate(90deg); }
#tc .action-coach.control-only.sw svg { transform:rotate(-90deg); }
#tc .action-linked, #tc .coach-now { outline:4px solid #fff3ce; outline-offset:4px; box-shadow:0 0 0 8px #14120f !important; opacity:1 !important; }
/* 構えは絵で置き換えず、案内と同じ字を押す場所に出す。 */
#tc [data-b="grd"].shield { background:#14120f; color:#fff3ce; opacity:1; }
#tc [data-b="grd"].shield .name { font-size:15px; line-height:1.2; letter-spacing:0; max-width:100%; padding:0; white-space:nowrap; }
/* 戦の操作案内は小さな手と一行。兵を見る場所を空ける。 */
#tc .action-coach.turn-coach { width:168px; max-width:168px; height:48px; text-align:left; }
#tc .action-coach.turn-coach span { padding:10px 8px 10px 40px; font-size:16px; line-height:1.4; white-space:normal; }
#tc .action-coach.turn-coach svg { left:8px; top:8px; width:24px; height:30px; }
/* 始点の指先から進む向きへ伸ばす。下地や文字には重ねない。 */
#tc .action-coach.turn-coach { height:128px; }
#tc .action-coach.turn-coach span { padding:4px 8px; text-align:center; }
#tc .action-coach.turn-coach svg, #tc .action-coach.turn-coach.move-coach svg { left:64px; top:86px; width:32px; height:40px; overflow:visible; }
#tc .action-coach.turn-coach .turn-arrow { display:block; filter:drop-shadow(0 0 2px #14120f) drop-shadow(0 0 1px #14120f); }
#tc .action-coach.turn-coach .coach-finger { animation:none; }
#tc .action-coach.turn-coach.move-coach .coach-finger { animation:move-finger 2.4s ease-in-out infinite; }
body.rm #tc .action-coach.move-coach .coach-finger { animation:none; }
@media (prefers-reduced-motion:reduce) { #tc .action-coach.move-coach .coach-finger { animation:none; } }
/* 指先は足もとの近くの操作面へ。札と短い軌跡を同じ場所にまとめる。 */
#tc .action-coach.turn-coach.foot-coach svg { left:var(--coach-finger-x); top:var(--coach-finger-y); width:32px; height:40px; }
#tc .action-coach.turn-coach.foot-coach span { position:absolute; left:calc(var(--coach-finger-x) - 64px); top:calc(var(--coach-finger-y) + 44px); width:168px; box-sizing:border-box; white-space:pre-line; font-size:16px; }
/* 初めて歩く時も、行き先と操作を一枚で読めるようにする。 */
/* なぞる向きは丸から伸びる一本だけ。手の輪郭を逆向きの矢印に見せない。 */
#tc .action-coach.swipe-coach .coach-finger { display:none; }
#tc .action-coach.swipe-coach.foot-coach .coach-finger { display:block; }
#tc .action-coach.swipe-coach.with-destination { height:160px; }
#tc .action-coach.swipe-coach.with-destination span { font-size:18px; line-height:1.4; white-space:pre-line; }
#tc .action-coach.swipe-coach.with-destination svg { top:116px; }
/* 歩く札は端の小さな案内にまとめ、道と人の見える幅を保つ。 */
#tc .action-coach.turn-coach.move-coach { width:160px; max-width:160px; height:112px; }
#tc .action-coach.turn-coach.move-coach svg { left:64px; top:48px; width:24px; height:30px; }
#tc .action-coach.turn-coach.move-coach span { position:absolute; top:84px; left:0; width:160px; box-sizing:border-box; padding:4px; font-size:15px; white-space:nowrap; }
/* 歩く手本は一枚の札と指だけ。行き先の矢印と競う矢印は足さない。 */
#tc .action-coach.turn-coach.move-coach { display:flex; align-items:center; gap:8px; width:200px; max-width:200px; height:48px; padding:4px 8px; box-sizing:border-box; background:#14120f; }
#tc .action-coach.turn-coach.move-coach svg { position:static; flex:0 0 24px; width:24px; height:32px; }
#tc .action-coach.turn-coach.move-coach span { position:static; width:auto; padding:0; font-size:16px; }
#tc .action-coach.turn-coach.move-coach .turn-arrow,
#tc .action-coach.turn-coach.move-coach .turn-touch { display:none; }
#tc .action-coach.turn-coach.move-coach .coach-finger { display:block; animation:none; }
/* 手本の指先を入力の始点へ置き、短い軌跡を操作面へ重ねる。 */
#tc .action-coach.turn-coach.foot-coach { display:block; width:168px; max-width:168px; height:128px; padding:0; background:none; }
#tc .action-coach.turn-coach.foot-coach svg { position:absolute; left:var(--coach-finger-x); top:var(--coach-finger-y); width:32px; height:40px; overflow:visible; }
#tc .action-coach.turn-coach.foot-coach span { position:absolute; left:calc(var(--coach-finger-x) - 64px); top:calc(var(--coach-finger-y) + 48px); width:168px; padding:4px 8px; white-space:normal; }
#tc .action-coach.turn-coach.foot-coach :is(.turn-arrow,.turn-touch,.coach-finger) { display:block; }
#tc .action-coach.turn-coach.foot-coach .coach-finger { animation:coach-swipe 2.4s ease-in-out infinite; }
/* なぞる手本は始点の丸と矢印一本にそろえる。入力範囲はそのまま。 */
#tc .action-coach.turn-coach.foot-coach .coach-finger,
#tc .action-coach.turn-coach.move-coach .coach-finger,
#tc .action-coach.swipe-coach .coach-finger { display:none; animation:none; }
#tc .action-coach.turn-coach.move-coach :is(.turn-arrow,.turn-touch) { display:block; }
@keyframes coach-swipe { 0%,20%,100% { translate:0 0; } 65%,85% { translate:var(--coach-dx,0px) var(--coach-dy,-40px); } }
body.rm #tc .action-coach.foot-coach .coach-finger { animation:none; }
@media (prefers-reduced-motion:reduce) { #tc .action-coach.foot-coach .coach-finger { animation:none; } }
/* 操作の絵と説明は端の小さな一枚に収める。 */
#tc .action-coach.turn-coach.foot-coach { width:168px; height:64px; }
#tc .action-coach.turn-coach.foot-coach svg { left:0; top:0; width:56px; height:64px; overflow:hidden; }
#tc .action-coach.turn-coach.foot-coach span { width:108px; padding:6px; font-size:15px; line-height:1.4; }
#tc .action-coach.turn-coach.foot-coach .coach-finger { display:none; animation:none; }
/* 触る端末だけ：画面の拡大・端の戻る・長押しの選択を止める */
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
/* 選び札の中を送っても、下の戦場の視点を動かさない。 */
html.touch #hud #battle-notices.choosing { touch-action: pan-y; overscroll-behavior: contain; }
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
html.touch body #hud #objectives:not(.expand) .dismount-action { pointer-events:auto; }
html.touch.tc-no-coach #hud #tutorial,
html.touch.tc-no-coach #tc :is(.hint,.move-hint,.look-hint,.action-coach,.stick b) { display:none !important; }
/* 小さな絵はそのままに、札の押せる高さと隣との間を確保する。 */
html.touch body #hud :is(#choice .opt,#battle-log-entry,#objectives li.more,#skiphint),
html.touch #screen :is(button,[role="button"],[role="tab"]) { min-height:44px !important; box-sizing:border-box; }
html.touch body #hud :is(#choice .opt,#battle-log-entry,#objectives li.more) { margin-top:8px !important; }
html.touch #screen :is(.row,.tabs,.keybind,.q .scale,.jp-scn,.jp-loop,.jp-tabs,.jp-chips) { gap:8px; }
html.touch #screen :is(button,[role="button"],[role="tab"]) { font-size:max(12px, 1em); }
html.touch #hud #tutorial :is(.what,.how) { white-space:pre-line; word-break:keep-all; overflow-wrap:normal; }
html.touch #hud #tutorial:not(.tc-scroll) { pointer-events: none !important; }
html.touch #choice .opt, html.touch #skiphint, html.touch #prompt { pointer-events: auto; cursor: pointer; }
/* 台詞と短い知らせは読むだけ。文字や札の余白も、歩く指を戦場へ通す。
   会話は任務の札にある記録の入口から読む。横向き・縦向き・左右の入れ替えに共通。 */
html.touch body #hud #battle-notices #battle-message,
html.touch body #hud #battle-notices #battle-message *,
/* 字幕側の「押せる」指定より強くし、後から入る戦ごとの様式にも負けない。 */
html.touch body #hud #battle-notices #battle-message #subtitle,
html.touch body #hud #battle-notices #battle-message #subtitle * { pointer-events: none !important; cursor: default; }
html.touch #sublog { pointer-events: auto; cursor: pointer; }
/* 飛ばせる場面の札は、右下の丸と重ならないよう上の真ん中へ。釦の字は出さず、札そのものを押す */
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
  html.touch .tr { width: 190px; gap: 8px; top: calc(8px + env(safe-area-inset-top, 0px)); }
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
  /* 走る境目の説明は輪の下へ置き、低い画面でも見せる。 */
  html.touch #tc .stick b { top: auto; bottom: -32px; color: #ece4d2; }
  html.touch #h-units { max-width: 30vw; }
  html.touch #hud:has(#h-units:not([hidden])) #subtitle { bottom: calc(126px + env(safe-area-inset-bottom, 0px)); }
  html.touch #h-units .uc { width: 52px; }
}

/* 触る端末の「最小」（.lean）：組の札の帯は号令の輪を開いている間だけ（平時の戦場を札で埋めない） */
html.touch:not(.tc-cmd) #hud.lean #h-units { display: none; }
/* 任務は今の一行だけ（「現在の任務」の見出しも出さない） */
#hud.lean #objectives h4 { display: none; }
/* iPad（高い画面）の「最小」：手がかりの札は細く小さく（戦場の左を塞がない。字は大きすぎない） */
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
#tc .tb { min-width:44px; min-height:44px; position: absolute; pointer-events: auto; touch-action: none; display: grid; grid-template-columns: minmax(0, 1fr); place-items: center; align-content: center; box-sizing: border-box;
  border-radius: 50%; border: 1.5px solid rgba(194,162,90,.62); background: rgba(14,11,8,var(--tc-bg, .58)); color: var(--washi);
  font: 700 13px/1.1 var(--ui); letter-spacing: .04em; text-shadow: 0 1px 2px #000; padding: 0; margin: 0;
  box-shadow: 0 0 0 1px rgba(0,0,0,.55), 0 2px 8px rgba(0,0,0,.35); transition: background .08s, border-radius .08s, border-color .08s; }
#tc .tb .name, #tc .tb small { background: #14120f; border-radius: 4px; padding: 2px; position: relative; z-index: 1; }
#tc .tb .name { box-sizing: border-box; max-width: calc(100% - 8px); min-width: 0; white-space: normal; overflow-wrap: anywhere; }
#tc .tb small { display: block; font-size: 12px; font-weight: 500; color: #f3d98a; margin-top: 2px; }
/* 添え書きは内側の幅で折り返し、全文を出す。行数で切らず、字は12pxを保つ。 */
#tc .tb small { box-sizing: border-box; max-width: calc(100% - 8px); min-width: 0; padding: 0 2px; white-space: normal; overflow-wrap: anywhere; line-height: 1.3; }
#tc .tb.tech small { color: #fff; font-weight: 700; white-space: pre-line; line-height: 1.2; }
html.touch #tc [data-b="more"] small { font-size: 12px; }
#tc .tb.sel { border-color: #f0c070; box-shadow: 0 0 0 2px rgba(240,192,112,.5), 0 2px 8px rgba(0,0,0,.35); }
#tc .tb.dim { border-style: dashed; }
#tc .tb.quiet { border-color: rgba(194,162,90,.4); }
#tc .tb:focus-visible { outline: 3px solid #f0c070; outline-offset: 2px; box-shadow: 0 0 0 6px #14120f; }
#tc .tb.pop { animation: tcpop .18s ease-out; }
@keyframes tcpop { 0%, 70% { background: #70291c; border-color: #f0c070; border-radius: 50%; box-shadow: inset 0 0 0 2px #f0c070, 0 0 12px rgba(240,192,112,.6); } }
#tc .tb.big { font-size: 17px; background: rgba(120,34,20,var(--tc-bg, .62)); border-width: 2px; }
/* 案内中も実物の押せる範囲を保ち、敵の頭上の印と形を分ける。 */
html.touch body #tc [data-b="atk"].action-linked { border-radius:10px !important; border:3px solid #fff3ce; min-width:44px; min-height:44px; }
html.touch body #tc [data-b="atk"]:is(.action-linked,.hold-guide) .name { white-space:normal; overflow-wrap:anywhere; font-size:20px; font-weight:900; line-height:1.15; }
html.touch body #tc [data-b="atk"].action-linked .name::before { content:none; }
html.touch body #tc [data-b="atk"]:is(.action-linked,.hold-guide) small { display:block !important; font-size:16px; font-weight:800; white-space:pre-line; }
#tc .attack-finger { display:none; position:absolute; left:calc(100% - 28px); top:8px; width:36px; height:44px; pointer-events:none; z-index:2; }
html.touch body #tc [data-b="atk"] small:empty { display:none !important; }
#tc .action-linked .attack-finger { display:none; }
html.touch body #tc [data-b="atk"] small { display:block !important; white-space:pre-line; overflow-wrap:normal; letter-spacing:0; }
html.touch body #tc [data-b="atk"].counter-ready .name { font-size:16px; font-weight:900; }
/* 攻撃は親指の位置に固定。押している間は角形と進みの輪で示す。 */
html.touch body #tc [data-b="atk"]:not([hidden]) { display:grid !important; visibility:visible !important; opacity:1 !important; background:#641f16; border:3px solid #fff3ba; border-radius:10px; top:auto !important; left:auto !important; right:calc(16px + env(safe-area-inset-right, 0px)); bottom:calc(16px + env(safe-area-inset-bottom, 0px)); min-width:96px; min-height:96px; box-sizing:border-box; pointer-events:auto; z-index:3; }
html.touch.tc-sw body #tc [data-b="atk"]:not([hidden]) { right:auto; left:calc(16px + env(safe-area-inset-left, 0px)) !important; }
html.touch body #tc [data-b="atk"] .name { font-size:22px; line-height:1.2; }
html.touch body #tc [data-b="atk"].holding { border-radius:12px !important; border:4px double #fff3ba; }
/* 案内の指先は親指側の攻撃釦へ向け、兵の上へ移さない。 */
#tc .action-linked .attack-finger { display:block; left:-44px; top:calc(50% - 16px); width:40px; height:32px; transform:none; }
#tc .action-linked.guide-swapped .attack-finger { left:auto; right:-44px; transform:scaleX(-1); }
/* 押せる丸を保ち、朱の地と金の光で手応えを出す */
#tc .tb.on, #tc .tb:active { background: #70291c; border-color: #f0c070; border-radius: 50%; box-shadow: inset 0 0 0 2px #f0c070, 0 0 12px rgba(240,192,112,.6); }
#tc .tb .cd { position: absolute; inset: 0; border-radius: 50%; background: conic-gradient(rgba(0,0,0,.55) var(--p, 0%), transparent 0); pointer-events: none; }
/* 門の操作は名と動きを分けず、押す場所に全文を書く。 */
#tc .tb.treatment { border:3px solid #f3d98a; background:#391c15; color:#fff3d0; font-size:18px; opacity:1; }
#tc .tb.treatment small { font-size:14px; white-space:normal; line-height:1.3; }
#tc .tb.treatment:disabled { border-style:dashed; color:#fff3d0; opacity:1; }
#tc .tb.gate-action { min-height:48px; opacity:1 !important; background:#241b11; border:3px solid #f3d98a; color:#fff3d0; border-radius:8px; font-size:16px; line-height:1.4; }
/* 左上の小さな釦（一時停止・戦術地図） */
#tc .sq { border-radius: 10px; width: 48px; height: 48px; font-size: 12px; }
#tc .sq svg { width: 20px; height: 20px; display: block; margin: 0 auto 1px; }
/* 浮かぶ棒 */
#tc .stick { position: absolute; width: 116px; height: 116px; margin: -60px 0 0 -60px; border-radius: 50%; border: 2px dashed #ece4d2; box-shadow: 0 0 0 2px #14120f; background: radial-gradient(circle, rgba(14,11,8,.12), rgba(14,11,8,.36)); pointer-events: none; }
#tc .stick.idle { opacity: .85; }
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
#tc .stick b { position: absolute; left: 50%; top: -32px; transform: translateX(-50%); padding: 4px 8px; background: #14120f; font-size: 15px; line-height: 1.4; font-weight: 500; color: #ece4d2; white-space: nowrap; text-shadow: 0 1px 2px #000; }
#tc .hint { position: absolute; left: 50%; top: calc(6px + env(safe-area-inset-top, 0px)); z-index: 1; transform: translateX(-50%); padding: 6px 14px; background: rgba(12,10,8,.82); box-shadow: inset 0 0 0 1px rgba(194,162,90,.4); font-size: 13px; white-space: nowrap; }
/* 号令の輪の案内は、輪のすぐ下に大きめに（上の帯と重ねない） */
#tc .hint.r { top: calc(50% + 206px); font-size: 15px; padding: 8px 16px; }
/* 弓の引き絞りと作業の進み具合。近接攻撃では出さない。 */
#tc .tb .chg { position: absolute; inset: -4px; border-radius: 50%; pointer-events: none; background: conic-gradient(#f0c070 var(--p, 0%), transparent 0); -webkit-mask: radial-gradient(circle, transparent 62%, #000 63%); mask: radial-gradient(circle, transparent 62%, #000 63%); }
#tc .tb .chg.full { background: #f0c070; }
/* 手ほどき：いま試す丸を光らせる */
#tc .tb.glow, #tc .stick.glow { box-shadow: 0 0 0 3px #f0c070, 0 0 18px 4px rgba(240,192,112,.65); animation: tcglow 1.2s ease-in-out infinite; }
@keyframes tcglow { 50% { box-shadow: 0 0 0 3px #f0c070, 0 0 6px 1px rgba(240,192,112,.3); } }
body.rm #tc .tb.glow, body.rm #tc .stick.glow { animation: none; }
#tc .tb.urge { box-shadow: 0 0 0 3px #f0c070, 0 0 14px 3px rgba(240,192,112,.5); opacity: 1 !important; }
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

/* ===== 携帯の横向き（tc-low）の戦：戦場を主役にする（10/11 本物の iPhone で札が真ん中を覆っていた） =====
   机の Chrome は指の端末にならず、この並べ方を一度も通っていなかった。後から足された札の指定より強く、ここで決め直す。
   左上＝任務の一行と要る知らせ／左下＝体力と組の一行／下の真ん中＝台詞の字幕／右下＝今使える丸だけ（添え書きは出さない） */
html.touch.tc-low body #tc .mzone { background: none !important; box-shadow: none !important; }
html.touch.tc-low body #tc .tb small { display: none !important; }
html.touch.tc-low body #tc [data-b="atk"] small { display:block !important; font-size:12px; }
html.touch.tc-low body #tc .tb.tech.on small, html.touch.tc-low body #tc [data-b="use"] small, html.touch.tc-low body #tc [data-b="treat"] small { display: block !important; }
html.touch.tc-low body #tc [data-b="atk"] { background:#641f16; border:3px solid #fff3ba; color:#fff3d0; font-size:24px; opacity:1; }
html.touch.tc-low body #tc .sq { opacity: .82; }
/* 記録の入口と左の任務を避け、案内は小地図の手前へ。長文も札の幅で折り返す。 */
html.touch.tc-low body #tc .hint { left: calc(env(safe-area-inset-left, 0px) + 340px); right: calc(env(safe-area-inset-right, 0px) + 96px); transform: none; white-space: pre-line; word-break:keep-all; overflow-wrap: normal; box-sizing: border-box; text-align: center; font-size: max(15px, calc(15px * var(--text-scale, 1))); line-height: 1.4; padding: 4px 10px; background: rgba(12,10,8,.9); }
/* 同じ上の場所を使う武将の札を優先する。選択肢を読む間も操作案内は休める。 */
html.touch.tc-low body:has(#hud #boss:not([hidden])) #tc .hint,
html.touch.tc-low body:has(#hud #choice:not([hidden])) #tc .hint { display: none !important; }
/* 携帯で表示倍率を変えた時も、案内の後ろへ兵力や方角の帯を重ねない。 */
html.touch.tc-low body:has(#tc:not([hidden]) #tc-hint:not([hidden])) #hud :is(#armybar, #compass) { visibility: hidden !important; }
html.touch.tc-low body #hud > #battle-log-entry { width: auto !important; min-width: 0; padding: 0 10px !important; background: rgba(10,9,7,.5) !important; border: 0 !important; box-shadow: none !important; font-size: 12px !important; }
html.touch.tc-low body #hud #battle-notices:not(.choosing), html.touch.tc-low body #hud #battle-notices.choosing {
  left: calc(max(16px, env(safe-area-inset-left, 0px) + 12px)) !important; right: auto !important;
  top: calc(60px + env(safe-area-inset-top, 0px)) !important; bottom: auto !important;
  width: min(280px, 32vw) !important; max-height: min(32vh, calc(100% - 172px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px))) !important;
  padding: 0 !important; gap: 8px !important; background: none !important; transform: none !important; margin: 0 !important; translate: none !important; }
/* 傷や構えの字は、実際の任務欄の右から二十四ずつ空ける。 */
html.touch.tc-low body #hud #boss {
  left: calc(max(16px, env(safe-area-inset-left, 0px) + 12px) + min(280px, 32vw) + 24px) !important;
  min-width: 0; overflow-wrap: anywhere; }
html.touch.tc-low body #hud #battle-notices.choosing { width: min(320px, 38vw) !important; max-height: calc(100% - 68px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)) !important; }
html.touch.tc-low body #hud #battle-notices.choosing #choice .choice-help { display: none !important; }
html.touch.tc-low body:has(#battle-notices.choosing) #tc .move-hint { display: none !important; }
html.touch.tc-low body #hud #battle-notices :is(#objectives, #banner, #tutorial, #situation, #skiphint) {
  background: rgba(10,9,7,.92) !important; border: 0 !important; box-shadow: none !important;
  padding: 4px 8px !important; font-size: max(16px, calc(16px * var(--text-scale, 1))) !important; line-height: 1.45 !important; text-shadow: 0 1px 2px #000; }
html.touch.tc-low body #hud #battle-notices #choice { padding: 6px 8px !important; font-size: 13px !important; }
/* 今の任務は札の幅で折り返す。押すとほかの任務も読む。 */
html.touch.tc-low body #hud #battle-notices #objectives:not(.expand) { min-height: 0 !important; height: auto !important; }
/* 押して開く一覧そのものに高さを持たせる。親札の余白だけでは押せる所が二十六画素になる。 */
html.touch.tc-low body #hud #battle-notices #objectives:not(.expand) #obj-list { min-height: 44px !important; min-width: 44px; height: auto !important; box-sizing: border-box; }
html.touch.tc-low body #hud #battle-notices #objectives:not(.expand) { width: 100% !important; }
html.touch.tc-low body #hud #battle-notices #objectives:not(.expand) li.cur { display: block !important; min-height: 0 !important; white-space: normal !important; overflow: visible !important; overflow-wrap: anywhere; text-overflow: clip !important; }
html.touch.tc-low body #hud #battle-notices #objectives:not(.expand) li.cur .obj-text { white-space: normal !important; }
html.touch.tc-low body #hud #battle-notices #objectives:not(.expand) .objnew { display: none !important; }
html.touch.tc-low body #hud #battle-notices #objectives:not(.expand) { pointer-events: auto !important; }
/* 台詞と任務の更新は、任務の下へ文の高さで並べる。 */
html.touch.tc-low body #hud #battle-notices #battle-message {
  position: relative !important; inset: auto !important;
  width: 100% !important; align-items: center; gap: 8px !important; pointer-events: none; }
html.touch.tc-low body #hud #battle-notices #battle-message > :is(#subtitle, .battle-notice) {
  width: fit-content !important; max-width: 100% !important; text-align: center; background: rgba(10,9,7,.92) !important; border: 0 !important; box-shadow: none !important;
  padding: 3px 10px !important; min-height: 0 !important; font-size: max(16px, calc(16px * var(--text-scale, 1))) !important; line-height: 1.45 !important; text-shadow: 0 1px 2px #000; }
html.touch.tc-low body #hud #battle-notices #battle-message > #subtitle .sp { display: inline !important; margin: 0 6px 0 0 !important; }
html.touch.tc-low body #hud #battle-notices #battle-message > #subtitle:not(:empty) ~ .battle-notice,
html.touch.tc-low body #hud #battle-notices #battle-message > .battle-notice ~ .battle-notice { display: none !important; }
html.touch.tc-low body #hud #battle-notices #battle-message > .battle-notice.treatment { font-size:max(18px, calc(18px * var(--text-scale, 1))) !important; }
/* 体力と組は左下に小さく一つにまとめる */
html.touch.tc-low body #hud .bl { left: calc(max(16px, env(safe-area-inset-left, 0px) + 12px)) !important; right: auto !important; bottom: calc(8px + env(safe-area-inset-bottom, 0px)) !important;
  width: 176px !important; padding: 2px 8px !important; background: rgba(10,9,7,.92) !important; border: 0 !important; box-shadow: none !important; }
html.touch.tc-low body #hud #h-squad:not([hidden]) { left: calc(max(16px, env(safe-area-inset-left, 0px) + 12px)) !important; right: auto !important; top: auto !important;
  bottom: var(--name-floor, calc(56px + env(safe-area-inset-bottom, 0px))) !important; width: 176px !important; max-width: 176px !important; min-height: 0 !important;
  padding: 2px 8px !important; gap: 0 8px !important; font-size: 12px !important; line-height: 1.45 !important; background: rgba(10,9,7,.92) !important; }
html.touch.tc-low body #hud #h-squad:not([hidden]) b { font-size: 12px !important; }
`;

// 親指側から四列・下から三段。追加の丸を開いても主な操作は動かさない
const TOUCH_EDGES = ['Tab', 'KeyE', 'Space', 'HorseRein', 'KeyQ', 'KeyF', 'KeyR', 'WeaponNext', 'WeaponSpear', 'KeyV'];
const LABEL_BTNS = ['atk', 'grd', 'dodge', 'lock', 'rally', 'wpn', 'mount', 'more', 'use', 'treat', 'form'];
const HOLD_RING_BTNS = ['use', 'treat', 'cmd'];
const TOGGLE_BTNS = ['grd', 'lock', 'cmd', 'more', 'fire'];
// 「取る」（使う）は出ている時だけの丸。七つ目以降で「…」に畳まれると、布を巻く・門を閉める等の長押しができない。先に並べる。
const ORDER_HORSE = ['atk', 'grd', 'dodge', 'use', 'spear', 'cmd', 'mount', 'lock', 'wpn', 'fire', 'rally'];
const ORDER_RANGED = ['atk', 'grd', 'dodge', 'use', 'spear', 'cmd', 'mount', 'lock', 'wpn', 'fire', 'rally'];
const ORDER_FOOT = ['atk', 'grd', 'dodge', 'use', 'spear', 'cmd', 'mount', 'lock', 'fire', 'rally', 'wpn'];
const BTN = [
  { id: 'atk', label: 'つく', sub: '', col: 0, row: 0, d: 96, big: true },
  { id: 'grd', label: 'かまえる', col: 0, row: 1, d: 64 },
  { id: 'dodge', label: 'よける', col: 1, row: 0, d: 64 },
  { id: 'lock', label: 'ねらう', col: 1, row: 1, d: 60 },
  { id: 'cmd', label: '指図', sub: 'えらぶ', col: 2, row: 0, d: 56 },
  { id: 'rally', label: '鼓舞', col: 2, row: 0, d: 56 },   // 回避の場所を空け、後の戦だけに出す
  { id: 'wpn', label: '持替', col: 0, row: 2, d: 48 },
  // 陣形の丸と同じ場所。号令を開いた時は隠す。
  { id: 'spear', label: '槍へ', col: 3, row: 2, d: 48 },
  { id: 'treat', label: 'きずを手当て', sub: '三秒 長く押す', col: 0, row: 0, d: 80 },
  { id: 'use', label: '取る', col: 1, row: 2, d: 56 },
  { id: 'mount', label: '乗る', col: 2, row: 1, d: 56 },
  // 号令の輪を開いている間だけ出す（組頭から）：陣形の切り替えと、弓・鉄砲の射撃の切り替え
  // 低い画面（スマホ横）で、六つ目からの丸（鼓舞・持ち替え・乗り降り）を畳む「…」の丸
  { id: 'more', label: '…', sub: 'ほか', col: 3, row: 0, d: 48 },
  { id: 'form', label: '陣形', col: 3, row: 2, d: 48 },
  { id: 'fire', label: '射撃', col: 3, row: 1, d: 48 },
  // 輪を開いた時だけ「ほか」の場所を使う。射撃を止める丸は畳まない。
  { id: 'ceasefire', label: 'やめ', col: 3, row: 0, d: 48 },
];
const ICON = {
  pause: '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="5" y="4" width="3.2" height="12" fill="currentColor"/><rect x="11.8" y="4" width="3.2" height="12" fill="currentColor"/></svg>',
  map: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M2 5l5-2 6 2 5-2v12l-5 2-6-2-5 2z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M7 3v12M13 5v12" stroke="currentColor" stroke-width="1.2"/></svg>',
};

let T = null; // 動いている時の中身
// 操作の札は画面の大きさではなく、実際に使っている入力に合わせる。
export function usesTouchControls() { return isTouch && !T?.kbd; }
// 指の釦が使う入力そのもの。描画の更新を待たずに試遊へ渡す。
// 対象を省いた呼び出しにも対応し、指定された時は別の遊びの入力を渡さない。
export function touchInput(game) { return T && (game === undefined || T.game === game) ? T.input : null; }
// 止まる案内は、いま歩く指を置いている場所へ重ねる。
export function touchMovePoint() { return T?.move || null; }

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
  isPhone = Math.min(screen.width, screen.height) < 600 || phoneViewport();
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
    `<div class="stick idle" id="tc-stick"><b>ここまで倒すと走る</b><i></i></div>` +
    `<button class="tb sq" id="tc-pause" aria-label="一時停止">${ICON.pause}止める</button>` +
    `<button class="tb sq" id="tc-map" aria-label="戦術地図">${ICON.map}地図</button>` +
    `<button class="tb sq" id="tc-view" aria-label="視点の切り替え（一人称）" aria-pressed="false"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M2 10c2.2-3.6 5-5.4 8-5.4s5.8 1.8 8 5.4c-2.2 3.6-5 5.4-8 5.4S4.2 13.6 2 10z" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="10" cy="10" r="2.6" fill="currentColor"/></svg>視点</button>` +
    BTN.map((b) => `<button class="tb${b.big ? ' big' : ''}" data-b="${b.id}" aria-label="${b.label}" style="width:${b.d}px;height:${b.d}px"><span class="name">${b.label}</span>${b.sub ? `<small>${b.sub}</small>` : ''}</button>`).join('') +
    `<button class="tb sq" id="tc-zin" aria-label="大地図を寄せる" hidden>＋<small>寄る</small></button>` +
    `<button class="tb sq" id="tc-zout" aria-label="大地図を引く" hidden>－<small>引く</small></button>` +
    `<div class="hint" id="tc-hint" hidden></div>`;
  const extraHelp = document.createElement('span'); extraHelp.id = 'tc-extra-help'; extraHelp.textContent = '武器の持ち替え・馬の追加操作'; extraHelp.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)'; root.appendChild(extraHelp);
  root.querySelector('[data-b=more]').setAttribute('aria-describedby', extraHelp.id);
  root.querySelector('[data-b=wpn]').setAttribute('aria-describedby', extraHelp.id);
  document.body.appendChild(root);
  const rot = document.createElement('div');
  rot.id = 'tc-rot';
  rot.hidden = true;
  rot.setAttribute('role', 'alertdialog');
  rot.setAttribute('aria-label', '画面を横にしてください');
  rot.setAttribute('aria-describedby', 'tc-rot-desc');
  rot.innerHTML = '<svg viewBox="0 0 84 84" aria-hidden="true"><rect x="28" y="10" width="28" height="48" rx="4" fill="none" stroke="#c2a25a" stroke-width="2.5"/><rect x="14" y="44" width="48" height="28" rx="4" fill="none" stroke="#c0452e" stroke-width="2.5"/><path d="M66 24a18 18 0 0 1 4 18" fill="none" stroke="#c2a25a" stroke-width="2"/><path d="M71 38l-1 5-4-3" fill="none" stroke="#c2a25a" stroke-width="2"/></svg><p>画面を横にしてください</p><small id="tc-rot-desc">この遊びは横向きで遊びます。<br>戦の途中なら止めてあります。横にしてから「再開する」を押してください。</small><small id="tc-rot-pause" hidden>戦は止めたままです。次の札で「再開する」を押してください。</small><button id="tc-rot-go" aria-describedby="tc-rot-pause">縦のまま続ける</button>';
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
        game.hud?.releaseWaitGuard?.();
        // 一つの親指で構えから攻めへ。弓・鉄砲の狙いは残す。
        if (input.touchGuardToggle && p.weapon !== 'gun' && p.weapon !== 'bow' && !T.held.has('grd')) p.guardOn = false;
        T.attackPressedAt = b.t; T.attackPressedBattle = b;
        input.mouseL = true; input.leftPressed = true; break;
      case 'grd': input.touchGuardToggle = true; input.mouseR = true; input.rightPressed = true; break;
      case 'dodge': input.edge.add(p.mounted ? 'HorseRein' : 'Space'); break;
      case 'lock': input.lockPressed = true; break;
      case 'treat': input.keys.add('TreatWound'); break;
      case 'use': input.keys.add('KeyE'); input.edge.add('KeyE'); break;
      case 'mount': input.edge.add('KeyR'); break;
      // 持っている得物を 槍→刀→火縄銃→弓 と回す（player.js の WeaponNext）
      case 'wpn': input.edge.add('WeaponNext'); break;
      case 'spear': input.edge.add('WeaponSpear'); break;
      case 'form': case 'fire': case 'ceasefire':
        p.command(id);
        p.radial = p.radialKeyboard = false; p.radialSel = p.radialPreview = -1; p.tabT = null;
        closeRadial(true); break;
      case 'more': T.more = !T.more; T.moreT = 0; break;
      case 'cmd':
        if (T.sticky) { closeRadial(true); return; }
        input.keys.add('Tab'); input.edge.add('Tab');
        T.radialDrag = { moved: 0, vx: 0, vy: 0, startedAt: performance.now() };
        break;
    }
  };
  const up = (id) => {
    switch (id) {
      case 'atk':
        if (T.attackPressedBattle === game.battle && game.battle.t - T.attackPressedAt >= .15) T.attackLearnedBattle = game.battle;
        T.attackPressedBattle = null; input.mouseL = false; break;
      case 'grd': input.mouseR = false; break;
      case 'treat': input.keys.delete('TreatWound'); break;
      case 'use': input.keys.delete('KeyE'); break;
      case 'cmd': {
        const d = T.radialDrag; T.radialDrag = null;
        if (!d) break;
        // なぞれば号令、短く押せば陣形も選べる指揮の札。長押しなら輪を開いたまま選ぶ。
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
        else if (performance.now() - d.startedAt <= 220) {
          const p = game.battle && game.battle.player;
          closeRadial(true);
          // 更新を挟まず押して放した時にも開く。次の更新で別の号令や札の開閉を重ねない。
          if (p) {
            p.radial = p.radialKeyboard = false;
            p.radialSel = p.radialPreview = -1; p.tabT = null;
            p.cmdOpen = !p.cmdOpen; p.cmdOpenT = 0;
          }
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
  function showHint(s, r) { s = coachAllowed(game.battle) ? coachText(s) : ''; T.hint.hidden = !s; T.hint.textContent = s; T.hint.classList.toggle('r', !!r); T.hintT = s ? (innerHeight < 500 ? 3 : 6) : 0; }

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
        // 鉄砲・弓の「狙う」「射る」は、押したまま指を滑らせて狙いを動かせる（離して撃つ）
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
    // 退避の丸は、視点側へ映っていても歩く始点として受ける。
    const b = game.battle, origin = game.hud.retreatTouchOrigin;
    const retreat = game.hud.retreatGuide;
    const fromRetreatRing = origin?.rt === b && b.t - origin.at <= .1 && retreat?.active && retreat.valid &&
      Math.hypot(retreat.x - b.player.u.pos.x, retreat.z - b.player.u.pos.z) >= retreat.radius &&
      Math.abs(e.clientX - origin.x) <= 32 && Math.abs(e.clientY - origin.y) <= 24;
    const navigation = game.hud.navigationTouchOrigin;
    const fromNavigationRing = navigation?.rt === b && b.t - navigation.at <= .1 &&
      ((game.hud.openingActive || navigation.areaAt === navigation.at) && e.clientX >= navigation.left && e.clientX <= navigation.right &&
        e.clientY >= navigation.top && e.clientY <= navigation.bottom ||
        Math.hypot(e.clientX - navigation.x, e.clientY - navigation.y) <= Math.max(28, navigation.radius || 0));
    // 向く案内の丸では、左右どちらの操作面でも見回す。
    const fromLookRing = fromNavigationRing && navigation.look;
    const moveSide = !fromLookRing && (fromRetreatRing || fromNavigationRing || inMoveZone(e.clientX, e.clientY));
    if (moveSide && !T.move) {
      T.moveStartX = T.game.battle.player.u.pos.x; T.moveStartZ = T.game.battle.player.u.pos.z;
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
    T.lookTravel = (T.lookTravel || 0) + Math.hypot(e.clientX - l.x, e.clientY - l.y);
    if (pl?.u.alive && !pl.camShot && T.lookTravel >= 32) T.lookLearned = true;
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
  window.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch') T.kbd = false;
    else if (e.pointerType === 'mouse' && game.battle && !e.target.closest?.('#tc, #screen')) T.kbd = true;
  }, true);

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
  const allowCoach = coachAllowed(b);
  tog(document.documentElement, 'tc-no-coach', !allowCoach);
  const tutorial = document.getElementById('tutorial');
  if (!allowCoach) {
    hide(tutorial, true); hide(T.hint, true);
  } else if (tutorial && T.tutorialContent !== tutorial.firstChild) {
    T.tutorialContent = tutorial.firstChild;
    // 札が入れ替わった時だけ、装飾を残して本文の文節を折る。
    for (const line of tutorial.querySelectorAll('.what,.how')) {
      for (const node of line.childNodes) if (node.nodeType === 3) node.textContent = coachText(node.textContent);
    }
  }
  if (!T.scr) T.scr = document.getElementById('screen');
  // 上空視点（rts.js）が開いている間は、武器の丸・歩く棒を隠す（下知の釦は hud.js の RTS の帯が出す）。
  // rts.js を import すると touch.js→rts.js→gunbai.js→player.js→touch.js で回ってしまうので、b._rts.on を直に見る
  // 引き上げ中も追手の攻撃は続く。決着だけで棒と釦を消すと、逃げ足も構えも使えなくなる。
  const on = !!(b && !b.ended && (!b.over || b.withdrawal) && !game.paused && !game.deployment && !game.photo && !game.helpOpen && !game.hud?.introWaiting && p?.u.alive && !T.rotShown && !T.kbd && T.scr.hidden && !(b._rts && b._rts.on));
  // 戦が止まったら、押しっぱなしの物を全部放す
  if (!on && T.was) reset();
  if (b) { b.touchCoachActive = false; b.touchSwipeActive = false; }
  { const hr = T.game.hud?.root; if (hr) { tog(hr, 'touch-swipe-coach', false); tog(hr, 'touch-travel-coach', false); if (!on) tog(hr, 'touch-turn-coach', false); } }   // 付いている時だけ外す（毎コマの DOM 書きを減らす）
  T.turnCoachShown = false;
  if (T.lockSwap !== S.touchSwap) { T.lockSwap = S.touchSwap; T.lockTip = false; }
  if (!b) {
    // 案内の控えが前の戦の兵・地形を次の支度まで抱え込まないようにする。
    T.battle = T.coachBattle = T.idleBattle = T.attackLearnedBattle = T.attackPressedBattle = T.coachTut = null;
  }
  if (on && T.battle !== b) { reset(); clearTimeout(T.lhT); T.battle = b; T.lockTip = false; T.glowId = null; T.coachSwap = null; T.coachTut = null; T.moved = false; T.moveLearned = false; T.lookLearned = false; T.lookTravel = 0; T.idleY = 0; T.hookAt = 0; T.zoneAt = 0; }
  // ゲームの外の画面（城下・図鑑・設定）では、ページの拡大を許す（戦の間だけ止める）
  const inGame = on;
  if (T.zoomLock !== inGame) { T.zoomLock = inGame; setZoomLock(inGame); }
  T.was = on;
  if (root.hidden !== !on) root.hidden = !on;
  if (!on) { game.hud?.releaseDodgeHold?.(); game.hud?.releaseCoverHold?.(); tog(game.hud?.root, 'attack-button-guide', false); tog(btn.atk, 'holding', false); return; }
  // 命中の震えは本人の strike から送る。兵同士の止めでは震えない。
  // 初めて狙いを定めた時だけ、相手の替え方を一度出す
  if (p.lock && !T.lockTip) { T.lockTip = true; T.showHint(S.touchSwap ? '画面の左を左右に払うと、狙う相手を替える' : '画面の右を左右に払うと、狙う相手を替える'); }
  // 右下の丸を並べる（安全な余白の中）
  // 城下（町を歩く）では戦の丸を出さない。「入る」の丸を右の親指の真下（突くの場所）へ
  const town = !!(b.def && b.def.town);
  T.town = town;
  const nearest = b.nearestInteract();
  const useItem = nearest?.id === 'bandage' ? null : nearest;
  const needsTreatment = p.u.alive && !b.over && !town && !b.def.dojo && (p.u.wounds?.bleed > 0.0001 || p.u.hp < p.u.maxHp * 0.6);
  const treatment = needsTreatment;
  const workAction = !!useItem?.hold && !/^(head|bandage|horse)/.test(useItem.id);
  const gateAvailable = useItem?.label === '門をしめる' || workAction;
  if (T.layoutW !== innerWidth || T.layoutH !== innerHeight || T.layoutSwap !== S.touchSwap || T.layoutSize !== S.touchSize || T.layoutAlpha !== S.touchAlpha || T.layoutTown !== town || T.layoutGate !== gateAvailable || T.layoutTreatment !== treatment) {
    T.layoutW = innerWidth; T.layoutH = innerHeight; T.layoutSwap = S.touchSwap;
    T.layoutSize = S.touchSize; T.layoutAlpha = S.touchAlpha; T.layoutTown = town;
    T.layoutGate = gateAvailable; T.layoutTreatment = treatment;
    layout();
  }
  if (T.hintWeapon !== p.weapon) {
    T.hintWeapon = p.weapon;
    T.showHint(p.weapon === 'gun' ? '攻撃の釦を押し続けて狙い、離して撃つ' : p.weapon === 'bow' ? '射るを押したままなぞって狙う。放して射る' : '');
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
    if (L2 > 16 && p.u.alive && !p.camShot && Math.hypot(p.u.pos.x - (T.moveStartX ?? p.u.pos.x), p.u.pos.z - (T.moveStartZ ?? p.u.pos.z)) > .35) T.moveLearned = true;
    const m = Math.min(1, Math.max(0, L2 - 8) / (R - 8));
    const ax = L2 > 0 ? dx / L2 * m : 0, ay = L2 > 0 ? dy / L2 * m : 0;
    T.axis.x = ax; T.axis.y = ay; input.axis = T.axis;
    input.runHeld = run;
    st.classList.remove('idle');
    st.hidden = false;
    st.classList.toggle('run', run);
    st.style.left = T.move.ox + 'px'; st.style.top = T.move.oy + 'px';
    // 走っている時は「走る」と字でも出す（色だけに頼らない）
    setText(st.firstElementChild, p.mounted ? ay > 0.15 ? '後ずさり' : -ay < 0.2 ? '横へ向ける' : -ay < 0.5 ? '並足' : -ay < 0.8 ? '速足' : p.breathRest ? '息切れ・並足で休む' : p.breath < p.maxBreath * 0.25 ? '息が残り少ない' : run ? '駆け足' : '速足' : run ? '走る' : 'ここまで倒すと走る');
    st.firstElementChild.style.display = allowCoach ? 'block' : 'none';
    st.lastElementChild.style.transform = `translate(${(ax * R).toFixed(1)}px, ${(ay * R).toFixed(1)}px)`;
  } else {
    // ゲームパッドが無ければ（axis が空）走りも解く
    if (!input.axis) input.runHeld = false;
    st.classList.add('idle'); st.classList.remove('run');
    // 触れていない時は、初めの30秒（初めての戦は60秒）だけ薄い棒を見せる（あとは景色を隠さない）
    const idleT = b.index === 0 ? 60 : 30;
    st.hidden = !allowCoach || touchMoveLearned(b) || b.t >= idleT && T.moved && !T.glowMove;
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
    // 初めのうちから、輪が走る境目だと字でも知らせる。
    setText(st.firstElementChild, 'うごく');
    st.firstElementChild.style.display = !st.hidden ? '' : 'none';
  }
  // 遮蔽へ退く間も普段の歩く入力を使う。指を放す・止まる・別の指で歩く時はすぐ解く。
  const coverHud = game.hud, cover = b.coverGuide;
  if (coverHud?.coverEl && !coverHud.coverEl.hidden) T.hint.hidden = true;
  if (coverHud?.coverHeldBattle === b) {
    if (T.move || b.choice || p.camShot || p.radial || p.cmdOpen || coverHud.bigmap || !cover?.valid || coverHud.coverEl?.hidden) {
      coverHud.releaseCoverHold();
    } else {
      const dx = cover.pos.x - p.u.pos.x, dz = cover.pos.z - p.u.pos.z, distance = Math.hypot(dx, dz);
      if (distance < .8) coverHud.releaseCoverHold();
      else {
        const a = coverHud.coverHoldAxis;
        a.x = (-dx * Math.cos(p.yaw) + dz * Math.sin(p.yaw)) / distance;
        a.y = -(dx * Math.sin(p.yaw) + dz * Math.cos(p.yaw)) / distance;
        input.axis = a; input.runHeld = false;
      }
    }
  }
  // 回避札も通常の歩行入力へ渡す。指を放す・地図・別の指の移動で即座に止める。
  if (coverHud?.dodgeHeldBattle === b) {
    const cue = b.dodgeGuide, goal = coverHud.dodgeHoldGoal;
    if (T.move || b.choice || b.over || !p.u.alive || p.camShot || p.radial || p.cmdOpen || coverHud.bigmap || !cue?.valid ||
        coverHud.dodgeEl?.style.display === 'none' || coverHud.dodgeAction?.style.display === 'none' ||
        Math.hypot(cue.pos.x - goal.x, cue.pos.z - goal.z) > 1.5) {
      coverHud.releaseDodgeHold();
    } else {
      const dx = goal.x - p.u.pos.x, dz = goal.z - p.u.pos.z, distance = Math.hypot(dx, dz);
      if (distance < 1.1) coverHud.releaseDodgeHold();
      else {
        const a = coverHud.dodgeHoldAxis;
        a.x = (-dx * Math.cos(p.yaw) + dz * Math.sin(p.yaw)) / distance;
        a.y = -(dx * Math.sin(p.yaw) + dz * Math.cos(p.yaw)) / distance;
        // なぞった時は指の向きを使い、押したままでも従来どおり歩ける。
        if (coverHud.dodgeDragActive) {
          const yaw = p.camYawOff || 0, x = coverHud.dodgeDragX, y = coverHud.dodgeDragY;
          a.x = x * Math.cos(yaw) + y * Math.sin(yaw);
          a.y = -x * Math.sin(yaw) + y * Math.cos(yaw);
        }
        input.axis = a; input.runHeld = false;
      }
    }
  }
  // 丸の出し入れ（その時に使える物だけ）。突く・構え・回避（馬上は手綱）は戦の間いつも出す
  const hasSq = !!b.squad?.some((o) => o.alive);
  const rid = p.mounted;
  // 基本の丸は突く・構え・回避・狙い。話す・取るは必要な時に出す。
  hide(btn.atk, town); hide(btn.grd, town || p.weapon !== 'bow'); hide(btn.dodge, town);
  // 馬上は 突く・構え・手綱・降りる（と号令）だけにし、狙い・鼓舞・持ち替えは隠す（丸が七つ並ばないように）
  // 狙いの丸は、敵が近い時（35m）か狙いを定めている時だけ（平時の戦場に丸を並べない）
  const hudR = game.hud, near = !!(hudR && hudR.nearFoe);
  void near; hide(btn.lock, town || rid);
  hide(btn.cmd, true);
  tog(btn.cmd, 'sel', !!p.radial || T.sticky);
  // 槍衾・鉄砲の列の前では、号令の丸を数秒だけ目立たせる（battle_tactics_cue.js）
  tog(btn.cmd, 'urge', hasSq && !p.radial && b.cmdUrgeUntil > b.t);
  const wl = p.weaponList ? p.weaponList() : ['spear'];
  // 馬上でも弓・鉄砲へは持ち替えられる（騎射）
  const rangedL = wl.includes('bow') || wl.includes('gun');
  // 弓・鉄砲からも一度で槍に戻す。「ほか」に畳まず、号令中は陣形に場所を譲る。
  hide(btn.spear, simpleControls(b) || town || p.weapon === 'spear' || p.radial || T.sticky || p.cmdOpen);
  hide(btn.wpn, simpleControls(b) || town || wl.length < 2 || (rid && !rangedL));
  if (!btn.wpn.hidden) {
    const nx = wl[(wl.indexOf(p.weapon) + 1) % wl.length];
    hide(btn.wpn, nx === 'spear' && !btn.spear.hidden);
    setText(btn.wpn.firstChild, { spear: '槍へ', sword: '刀へ', gun: '鉄砲へ', bow: '弓へ' }[nx]);
  }
  // 鉄砲の攻撃は長押しで狙い、離して撃つ。弾込めの進みを丸の縁に示す。
  const gunW = p.weapon === 'gun', bowW = p.weapon === 'bow';
  // 近接攻撃に長押しの案内を足さない。
  tog(btn.atk, 'hold-guide', false);
  const attackEnemy = T.game.hud?.approachGuideEnemy || T.game.hud?.attackGuideEnemy || T.game.hud?.aimGuideEnemy || (b.guideEnemyShown && b.guideEnemy);
  const attackFacing = attackEnemy?.alive && Math.cos(Math.atan2(attackEnemy.pos.x - p.u.pos.x, attackEnemy.pos.z - p.u.pos.z) - p.yaw) > .94;
  const attackInReach = attackEnemy?.alive && Math.hypot(attackEnemy.pos.x - p.u.pos.x, attackEnemy.pos.z - p.u.pos.z) <= p.meleeReach(p.weapon === 'sword' ? 'slash' : 'thrust');
  const attackAvailable = !town && attackInReach && !S.reduceGuidance && !gunW && !bowW && attackFacing &&
    !T.game.hud?.openingActive && !T.game.hud?.bigmap && !b.over && !b.choice && !p.camShot && !p.radial && !p.cmdOpen;
  // 敵の印は見る目標。攻撃釦は常に親指の届く位置に保つ。
  if (T.attackGuideBattle !== b) {
    T.attackGuideBattle = b; T.attackGuideActive = false; T.attackGuideAt = -Infinity;
  }
  // 消してから出し直す案内も八秒あける。表示中の手は動かさない。
  if (!attackAvailable) T.attackGuideActive = false;
  else if (!T.attackGuideActive && b.t - T.attackGuideAt >= 8) {
    T.attackGuideActive = true; T.attackGuideAt = b.t;
  }
  const attackLinked = attackAvailable && T.attackGuideActive;
  b.touchAttackGuideActive = !town && !gunW && !bowW && !S.reduceGuidance;
  tog(btn.atk, 'action-linked', attackLinked);
  tog(game.hud?.root, 'attack-button-guide', attackLinked);
  tog(btn.atk, 'guide-swapped', !!S.touchSwap);
  // 押す実物の枠と短い字で示し、人物に重なる指を足さない。
  if (!btn.atk._guideFinger) {
    const finger = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    finger.setAttribute('class', 'attack-finger'); finger.setAttribute('viewBox', '0 0 40 32');
    finger.setAttribute('aria-hidden', 'true');
    finger.innerHTML = '<path d="M4 16H34M23 5L34 16L23 27" fill="none" stroke="#14120f" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 16H34M23 5L34 16L23 27" fill="none" stroke="#fff3ce" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>';
    btn.atk.appendChild(finger); btn.atk._guideFinger = finger;
  }
  tog(btn.atk, 'spear-linked', attackLinked && p.weapon === 'spear');
  const counterReady = attackLinked && !!game.hud.counterGuideEnemy;
  tog(btn.atk, 'counter-ready', counterReady);
  // 押した時の一撃と、案内に対応する釦の名前を保つ。
  tog(btn.atk, 'holding', !!input.mouseL);
  const attackLabel = gunW ? '攻撃' : bowW ? '射る' : p.weapon === 'sword' ? 'きる' : 'つく';
  setText(btn.atk.firstChild, attackLabel);
  const attackAria = attackLabel;
  if (btn.atk.getAttribute('aria-label') !== attackAria) btn.atk.setAttribute('aria-label', attackAria);
  setText(btn.grd.firstChild, gunW || bowW ? '狙う' : '構え');
  tog(btn.grd, 'shield', !gunW && !bowW);
  const sub = btn.atk.querySelector('small');
  // 弓・鉄砲だけ、離して放つ説明を添える。
  const blade = !gunW && !bowW;
  // 攻撃の押し方は実物の釦の中にまとめる。
  const teachB = allowCoach;
  if (sub) setText(sub, blade ? '押す' : !teachB ? (gunW ? p.gunAmmo === 0 ? '弾がない' : p.gunLoaded ? '' : '弾込め中' : p.bowAmmo <= 0 ? '矢がない' : '') : gunW ? (p.gunLoaded ? (p.aiming ? '離して撃つ' : '長押しで狙う') : p.gunAmmo === 0 ? '弾がない' : p.knockT > 0 || p.staggerT > 0 ? '体勢を戻す' : '弾込め中') : p.bowAmmo <= 0 ? '矢がない' : p.draw >= 2 ? (p.bowHold > 3 ? '腕が疲れる' : '離して射る') : p.draw >= 0.6 ? '引き絞る' : p.draw > 0 ? '矢を番える' : '押して引く');
  // 弓の任意の構えと、近接の構えの案内。鉄砲の構え釦は隠す。
  { let gs = btn.grd.querySelector('small'); const t = bowW ? (p.guardOn ? 'もう一度で解く' : '押して保つ') : p.guardBroken > 0 ? '体勢を戻す' : p.sta <= 0 ? '気力不足' : p.guardOn ? 'もう一度で解く' : teachB ? '押して保つ' : '';
    if (t && !gs) { gs = document.createElement('small'); btn.grd.appendChild(gs); } if (gs) setText(gs, teachB ? t : p.guardBroken > 0 ? '体勢を戻す' : p.sta <= 0 ? '気力不足' : ''); }
  tog(btn.atk, 'tech', false);
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
  hide(btn.ceasefire, !rOpen || b.G.rank < 1 || (!gunSq && !bowSq));
  btn.ceasefire.setAttribute('aria-label', '弓・鉄砲の組、撃ち方やめ');
  hide(btn.fire, gunSq ? !b.kamae : !rOpen || b.G.rank < 1 || !bowSq);
  setText(btn.fire.firstChild, gunSq ? (b.kamae ? '放て' : '構え') : '射撃');
  btn.fire.setAttribute('aria-label', gunSq ? (b.kamae ? '鉄砲の組、放て' : '鉄砲の組、構え') : '弓の射撃');
  tog(btn.fire, 'sel', !!(gunSq && b.kamae));
  // 空馬の手綱を取れる時は、乗り降りの丸を「手綱」にして必ず出す
  const dismountAction = b.hud?.actionLabel;
  const guidedDismount = rid && !b.hud?.root.classList.contains('mission-only') && dismountAction && !dismountAction.hidden && !!dismountAction.querySelector('.dismount-action');
  hide(btn.mount, simpleControls(b) || town || guidedDismount || (!rid && !p.canRide && !p.takeO));
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
  const canUse = !!useItem;
  // 長押しの作業は共通の押せる札へまとめる。
  hide(btn.use, !canUse || workAction);
  // 使える手当ては共通の押せる札へまとめ、同じ操作を二つ出さない。
  hide(btn.treat, !treatment || p.treatmentReady || guidedDismount);
  tog(btn.treat, 'treatment', true);
  btn.treat.disabled = !p.treatmentReady;
  tog(btn.treat, 'ready', p.treatmentReady);
  const gateAction = useItem?.label === '門をしめる';
  tog(btn.use, 'gate-action', gateAction || workAction);
  const promptText = canUse ? useItem.label + '|' + useItem.hold : '';
  if (canUse && (T.promptText !== promptText || T.promptTown !== town)) {
    T.promptText = promptText; T.promptTown = town;
    let tx = useItem.label || '';
    if (useItem.hold) tx += '（長押し）';
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
    setText(btn.use.firstChild, gateAction ? '門をしめる' : workAction ? /火/.test(useItem.label) ? '火をつける' : useItem.label.replace(/（[^）]*）/g, '') : short || (town ? '入る' : '取る'));
    setText(sm, town ? nameEl.slice(0, 6) : allowCoach && /（長押し）/.test(tx) ? '長押し' : nameEl);
    btn.use.setAttribute('aria-label', tx || '取る');
  }
  if (treatment) {
    // 組の札・命の札に重ねない：重なる札があれば、その上へ持ち上げる（札の場所は 0.25 秒ごとに測った物を使う）。
    if (T.treatBase != null && b.hud?.hudRects) {
      let top = T.treatBase;
      const rects = b.hud.hudRects() || [];
      for (let i = 0; i < 4; i++) {
        let moved = false;
        for (const r of rects) {
          if (r.right > T.treatLeft - 8 && r.left < T.treatLeft + 104 && r.bottom > top - 8 && r.top < top + 88) { top = r.top - 88; moved = true; }
        }
        if (!moved) break;
      }
      top = Math.round(Math.max(T.treatMin, top));
      if (top !== T.treatTop) { T.treatTop = top; btn.treat.style.top = top + 'px'; }
    }
    const progress = b.holdId === 'bandage' ? b.holdPct || 0 : 0;
    const remaining = Math.max(1, Math.ceil(3 * (1 - progress)));
    setSub(btn.treat, p.treatmentLeft <= 0 ? '布がない' : p.treatmentNext > b.t ? '少し休む' :
      p.treatmentReady ? p.treating ? `あと${remaining}秒` : allowCoach ? '三秒長おし' : '' : p.mounted ? '馬をおりる' :
      b.hud.retreatGuide?.active && b.hud.retreatGuide.treatment && b.hud.retreatGuide.valid ?
        Math.hypot(b.hud.retreatGuide.x - p.u.pos.x, b.hud.retreatGuide.z - p.u.pos.z) < b.hud.retreatGuide.radius ? '止まって 少しまつ' : b.def.treatmentApproachLabel || 'ここへ すすむ' : '味方の後ろへ さがる');
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
  setText(btn.lock.firstChild, p.lock ? 'やめる' : 'ねらう');
  tog(btn.grd, 'sel', !!p.guard || !!p.aiming);
  tog(btn.dodge, 'dim', (!p.mounted && p.sta < 20));
  setText(btn.dodge.firstChild, p.mounted ? '引く' : 'よける');
  setSub(btn.dodge, p.mounted ? '手綱を緩める' : p.u.climb ? '登っている' : p.knockT > 0 ? '起き上がる' : p.dodgeT > -0.3 ? `あと${Math.max(1, Math.ceil(p.dodgeT + 0.3))}秒` : '');
  const rd = p.rallyCd || 0;
  // 鼓舞・鬨の声は敵が遠くても使える。逃げた組を励ます時にも出し、待ち時間は丸に書く。
  hide(btn.rally, true);   // 鼓舞の丸は無くした（kaito 10/23 稲生 55）
  setText(btn.rally.firstChild, hasSq ? '鼓舞' : '鬨の声');
  tog(btn.rally, 'dim', rd > 0);
  setSub(btn.rally, rd > 0 ? `あと${Math.ceil(rd)}秒` : '声を上げる');
  let cd = btn.rally.querySelector('.cd');
  if (rd > 0) { if (!cd) { cd = document.createElement('span'); cd.className = 'cd'; btn.rally.appendChild(cd); } cd.style.setProperty('--p', Math.min(100, rd / 25 * 100).toFixed(0) + '%'); cd.hidden = false; } else if (cd) cd.hidden = true;
  // 弓を引く間だけ内縁を満たす。
  let ch = btn.atk._chargeRing;
  if (!ch) { ch = document.createElement('span'); ch.className = 'chg'; btn.atk.appendChild(ch); btn.atk._chargeRing = ch; }
  const cT = bowW ? Math.min(1, p.draw / 2) : 0;
  ch.hidden = cT <= 0;
  if (cT > 0) { ch.style.setProperty('--p', (cT * 100).toFixed(0) + '%'); tog(ch, 'full', cT >= 1); }
  // 長押しで取る物と、号令の輪を開くまでの待ちも縁で示す。
  for (const id of HOLD_RING_BTNS) {
    const el = btn[id];
    let ring = el._holdRing;
    if (!ring) { ring = document.createElement('span'); ring.className = 'chg'; el.appendChild(ring); el._holdRing = ring; }
    const progress = id === 'treat' ? (b.holdId === 'bandage' ? b.holdPct || 0 : 0) : id === 'use' ? (T.held.has(id) ? b.holdPct || 0 : 0) : (T.held.has(id) ? Math.min(1, (p.tabT || 0) / 0.22) : 0);
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
  // 丸は畳まずに並べる（「…」は出さない）
  for (const id of fold) hide(btn[id], !T.more);
  if (!fold.length) T.more = false;
  hide(btn.more, true);
  // 輪の射撃と停止は、横向きの携帯でも直接押せるようにする。
  if (rOpen && b.G.rank >= 1 && (gunSq || bowSq)) { hide(btn.fire, false); hide(btn.more, true); }
  tog(btn.more, 'sel', !!T.more);
  let foldKey = '';
  for (const id of fold) foldKey += (foldKey ? '・' : '') + btn[id].firstChild.textContent;
  if (T.foldKey !== foldKey) { T.foldKey = foldKey; T.foldNames = foldKey; }
  setSub(btn.more, T.more ? '閉じる' : '開く');
  btn.more.setAttribute('aria-description', T.foldNames);
  if (btn.more.title !== '武器の持ち替え・馬の追加操作を開く') btn.more.title = '武器の持ち替え・馬の追加操作を開く';
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
  actionCoach(b, dt);
  tog(game.hud.root, 'touch-turn-coach', T.turnCoachShown);
  if (T.radialDrag && p.radial) feedDrag(T.radialDrag);
  // 号令の輪：開いたまま待っている時は、放っておくと閉じる
  if (T.sticky && !input.keys.has('Tab')) T.sticky = false;
  if (T.sticky && !T.held.size && !T.looks.size) {
    T.stickyT = (T.stickyT || 0) + dt;
    if (T.stickyT > 8) { reset(); return; }
  } else T.stickyT = 0;
  if (!T.hint.hidden) { T.hintT -= dt; if (T.hintT <= 0) { if (p.radial || T.sticky) { setText(T.hint, '真ん中で閉じる'); } else T.hint.hidden = true; } }
}

const RUN_COACH = ['⬆ 上へ\n大きくなぞる', '⬈ 右上へ\n大きくなぞる', '➜ 右へ\n大きくなぞる', '⬊ 右下へ\n大きくなぞる',
  '⬇ 下へ\n大きくなぞる', '⬋ 左下へ\n大きくなぞる', '⬅ 左へ\n大きくなぞる', '⬉ 左上へ\n大きくなぞる'];
const SWIPE_NAMES = ['上', '右上', '右', '右下', '下', '左下', '左', '左上'];
function placeFootCoach(b, el, turning) {
  const hud = T.game.hud;
  // 見本は左右の端に収める。小さい絵でも入力の始点は同じ場所にする。
  const left = (turning ? !S.touchSwap : S.touchSwap) ? VIEW.w - 188 : 20;
  const top = Math.max(80, VIEW.h - 144);
  tog(el, 'foot-coach', true);
  el.style.left = left + 'px'; el.style.top = top + 'px';
  el.querySelector('svg').setAttribute('viewBox', '-64 -80 160 176');
  const caption = el.lastElementChild;
  caption.style.left = '60px'; caption.style.top = '8px';
  const origin = hud.navigationTouchOrigin || (hud.navigationTouchOrigin = {});
  origin.rt = b; origin.at = b.t; origin.x = left + 28; origin.y = top + 32;
  origin.look = turning; origin.radius = 28;
  T.coachOriginAt = b.t;
}
// 通常の戦でも、今必要な移動・見回しだけを実際の操作側へ示す。
function fieldSwipeCoach(b, el) {
  const hud = T.game.hud, p = b.player;
  // 通常の戦も、必要な向きと触る始点を短く示す。
  if (S.reduceGuidance || (b.teachOn && !b.teachOn()) || b.def.town || b.def.dojo || b.over || !p.u.alive || b.choice || p.camShot || p.radial || p.cmdOpen ||
      T.sticky || hud.bigmap || hud.openingActive || b.nearestInteract() || document.getElementById('wait-guard')?.hidden === false ||
      hud.coverEl && !hud.coverEl.hidden) return;
  // 足元からの退避矢印と、任務にまとめた指の案内を別の札で置き換えない。
  if (b.dodgeGuide?.valid || hud.retreatGuide?.active && hud.retreatGuide.valid || hud.approachGuideEnemy?.alive ||
      document.getElementById('objectives')?.classList.contains('facing-order')) return;
  const dodge = b.dodgeGuide?.valid && !b.dodgeGuide.arrived ? b.dodgeGuide : null;
  if (!dodge && (p.u.wounds?.bleed > .0001 || p.u.hp < p.u.maxHp * .6)) return;
  const retreat = hud.retreatGuide?.active && hud.retreatGuide.valid ? hud.retreatGuide : null;
  const enemy = !dodge && !retreat && hud.defendEnemy?.alive && !hud.guardFacing ? hud.defendEnemy : null;
  const route = b.missionGuide;
  const waiting = !dodge && !retreat && !enemy && b.def.waitFacingPoint?.(b);
  const path = !dodge && !retreat && !enemy && route?.marker && b.def.guidePath?.(b, route.marker);
  const travelling = route?.marker && route.distance > (route.marker.guideRadius || 8);
  const approach = !dodge && !retreat && hud.approachGuideEnemy?.alive ? hud.approachGuideEnemy : null;
  const goal = dodge?.pos || retreat || enemy?.pos || approach?.pos || (travelling ? path?.[path.length - 1] || route.pos : waiting);
  if (!goal || !dodge && !retreat && !enemy && !approach && !waiting && b.guideEnemyShown) return;
  const yaw = p.yaw + (p.camYawOff || 0);
  const dx = goal.x - p.u.pos.x, dz = goal.z - p.u.pos.z;
  if (!dodge && retreat && Math.hypot(dx, dz) < retreat.radius) return;
  const side = -dx * Math.cos(yaw) + dz * Math.sin(yaw);
  const forward = dx * Math.sin(yaw) + dz * Math.cos(yaw);
  const turning = !!enemy || !!waiting && !travelling || !dodge && !retreat && forward < Math.hypot(dx, dz) * .7;
  if (turning && !enemy && !travelling && forward > Math.hypot(dx, dz) * .94) return;
  const direction = turning ? side >= 0 ? 2 : 6 : (Math.round(Math.atan2(side, forward) / (Math.PI / 4)) + 8) % 8;
  const key = `field-${turning ? 'turn' : 'move'}-${direction}`;
  if ((turning ? T.lookLearned : touchMoveLearned(b)) || T.input.touchMoving || T.input.touchDx || T.input.touchDy) return;
  if (T.coachBattle !== b) { T.coachBattle = b; T.coachSeen.clear(); T.actionKey = ''; }
  if (T.actionKey === key && b.t - (T.coachSeen.get(key) ?? b.t) >= 3) { T.actionKey = ''; return; }
  if (T.actionKey !== key && b.t - (T.coachSeen.get(key) ?? -99) < 8) return;
  const lookSide = S.touchSwap ? .25 : .75;
  const fraction = turning ? lookSide : 1 - lookSide;
  const x = Math.max(16, Math.min(VIEW.w - 184, VIEW.w * fraction - 84));
  let y = -1;
  // 触る側は変えず、札や操作釦の空いた高さへ指を置く。
  for (let i = 0; i < 4; i++) {
    const cy = Math.max(88, turning ? VIEW.h * .48 - 30 : VIEW.h - 172) + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 40;
    if (cy < 76 || cy + 128 > VIEW.h - 16) continue;
    let blocked = false;
    for (const r of T.zoneRects) if (r.on && x + 168 > r.left && x < r.right && cy + 128 > r.top && cy < r.bottom) { blocked = true; break; }
    if (blocked) continue;
    for (const r of hud.rectsAll || []) if (x + 168 > r.left && x < r.right && cy + 128 > r.top && cy < r.bottom) { blocked = true; break; }
    if (!blocked) { y = cy; break; }
  }
  if (y < 0 && !turning) return;
  // 札は三枚まで。既存の回避札はこの指の札へ置き換える。
  b.touchCoachActive = true;
  hud.notices.sync();
  const occupied = 1 + hud.notices.picks.length + Number(document.getElementById('boss')?.hidden === false) +
    Number(document.getElementById('target')?.hidden === false) + Number(!!b.guideEnemyShown);
  if (occupied >= 3) { b.touchCoachActive = false; return; }
  if (T.actionKey !== key) { T.actionKey = key; T.coachSeen.set(key, b.t); }
  el.className = 'action-coach turn-coach swipe-coach';
  tog(el, 'move-coach', !turning);
  const destination = dodge ? '攻撃をよける' : retreat ? '味方の後ろへ下がる' : enemy ? '印の敵へ向く' : travelling
    ? b.def.travelGuideLabel?.(b, true) || (route.marker.red ? '敵の印へ進め' : '旗へ進め') : '敵の方へ向く';
  tog(el, 'with-destination', !!destination && turning);
  setText(el.lastElementChild, `${turning ? `${SWIPE_NAMES[direction]}を向く` : destination}\n${SWIPE_NAMES[direction]}へなぞる`);
  const arrow = el.querySelector('.turn-arrow');
  el.querySelector('.turn-touch').setAttribute('r', '22');
  arrow.setAttribute('d', 'M40 6H88M76-6L88 6L76 18');
  arrow.setAttribute('transform', `rotate(${direction * 45 - 90} 16 6)`);
  el.style.setProperty('--turn-shift', '0px');
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  placeFootCoach(b, el, turning);
  // 指は動かさなくても、始点の輪と一本の矢印で方向を読める。
  el.querySelector('.coach-finger').style.transform = '';
  el.hidden = false; T.hint.hidden = true;
  b.touchMoveGoal = turning ? null : goal;
  b.touchSwipeActive = true;
  tog(hud.root, 'touch-swipe-coach', true);
  tog(hud.root, 'touch-travel-coach', !!travelling && !dodge && !retreat && !enemy &&
    (route.marker.guideArea === 'wait' || route.marker.guideArea === 'guard' || !!route.marker.waitGuide));
}

// 案内は一つだけ。指の絵を実際に触る場所へ置き、操作そのものは下の戦場へ通す。
function actionCoach(b, dt) {
  b.touchMoveGoal = null;
  if (!T.actionCoach) {
    const el = document.createElement('div'); el.className = 'action-coach'; el.hidden = true;
    el.innerHTML = '<svg viewBox="0 0 32 40" aria-hidden="true"><circle class="turn-touch" cx="16" cy="6" r="14" fill="#14120f" stroke="#fff3ce" stroke-width="2"/><path class="turn-arrow" d="M16 6H80M68-6L80 6L68 18" fill="none" stroke="#fff3ce" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path class="coach-finger" d="M12 23V6q0-5 5-3q2 1 2 4v12l3-1 6 4q3 2 2 7l-3 9H13L5 27q-3-5 1-6q2-1 6 2Z" fill="#fff3ce" stroke="#14120f" stroke-width="2"/></svg><span></span>';
    T.root.appendChild(el); T.actionCoach = el; T.coachSeen = new Map();
  }
  const el = T.actionCoach;
  el.hidden = true;
  if (T.coachButton) { T.coachButton.classList.remove('coach-now'); T.coachButton = null; }
  // 教える二つの戦以外では、指や操作の札を出さない。
  if (!b.def.town && !b.def.dojo || !coachAllowed(b) || S.reduceGuidance) { T.actionKey = ''; return; }
  // 合戦の操作図は開幕の一枚だけ。戦の途中は任務と敵の印に譲る。
  if (!b.def.town && !b.def.dojo && !T.game.hud?.openingActive) { T.actionKey = ''; return; }
  const p = b.player, rain = b.army.rainEscape || b.dodgeGuide;
  if (b.touchAttackGuideActive && !rain && (T.game.hud?.attackGuideEnemy?.alive || b.guideEnemyShown && b.guideEnemy?.alive)) { T.actionKey = ''; return; }
  const compact = T.game.hud?.root.classList.contains('compact-battle');
  const hud = T.game.hud;
  if (p.mounted && hud?.retreatGuide?.active && hud.retreatGuide.treatment && !b.dodgeGuide) { T.actionKey = ''; return; }
  // 見回す手本が任務札にある間は、押す操作の札を足さない。
  if (document.getElementById('objectives')?.classList.contains('facing-order')) { T.actionKey = ''; return; }
  // 戦場側ですでに指を描いたコマは、二つ目の指と説明を重ねない。
  if (hud?.navigationTouchOrigin?.rt === b && hud.navigationTouchOrigin.at !== T.coachOriginAt &&
      b.t - hud.navigationTouchOrigin.at < .15) { T.actionKey = ''; return; }
  // 行き先の札に指となぞり方がある間は、操作の札をもう一枚出さない。
  if ((hud?.destinationMoveDirection || hud?.combatActionUnified || hud?.retreatGuide?.active) &&
      hud.notices.sources[1].selected) { T.actionKey = ''; return; }
  const firstAttack = T.attackLearnedBattle !== b && b.guideEnemyShown && b.guideEnemy?.alive &&
    (!hud?.defendEnemy || !!hud?.attackGuideEnemy);
  const near = !!b.guideEnemyShown || (compact ? !!hud?.okeThreatActive : !!(b.guideEnemy || p.lock?.alive || hud?.nearFoe));
  const occupied = (hud?.notices.picks.length || 0) + Number(document.getElementById('boss')?.hidden === false) +
    Number(document.getElementById('target')?.hidden === false);
  const blocked = !firstAttack && occupied >= 3 || hud?.actionLabel && !hud.actionLabel.hidden && !firstAttack || !!b.dodgeGuide || b.def.town || b.def.dojo || b.over || p.camShot || p.radial || p.cmdOpen || T.sticky ||
    T.game.hud?.bigmap || T.game.hud?.openingActive || b.choice || T.game.hud?.root.classList.contains('guard-button-help') ||
    T.game.hud?.root.classList.contains('wait-guard-active') || hud?.coverEl && !hud.coverEl.hidden ||
    !firstAttack && !document.getElementById('boss')?.hidden || !rain && b.nearestInteract() ||
    !rain && !near && b.missionGuide?.marker && !document.getElementById('target')?.hidden ||
    !rain && (p.u.wounds?.bleed > 0.0001 || p.u.hp < p.u.maxHp * 0.6) ||
    b.tut && !b.tut.ok && b.hud.notices.visible('tutorial');
  el.hidden = true;
  if (T.coachButton) { T.coachButton.classList.remove('coach-now'); T.coachButton = null; }
  if (T.coachBattle !== b) { T.coachBattle = b; T.coachSeen.clear(); T.actionKey = ''; T.openingHelp = 0; }
  tog(el, 'swipe-coach', false);
  tog(el, 'opening-coach', false);
  tog(el, 'turn-coach', false);
  tog(el, 'move-coach', false);
  tog(el, 'route-coach', false);
  tog(el, 'enemy-turn-coach', false);
  tog(el, 'foot-coach', false);
  el.querySelector('svg').setAttribute('viewBox', '0 0 32 40');
  tog(el, 'control-only', false);
  // 長押しの説明は押せる枠の中へ集め、離れた説明札を重ねない。
  const linkedAttack = T.btn.atk.classList.contains('action-linked');
  // 押せる丸の中に説明がある時は、外側の操作札を足さない。
  if (linkedAttack) { b.touchCoachActive = true; T.actionKey = ''; return; }
  // 押し方は敵の脇の札だけに置き、上や別の丸へ案内を重ねない。
  // 手ほどきの文が出ている間も、実物の押せる丸に枠と指を添える。
  // 説明札は増やさず、攻撃・構え・号令をいつも同じ位置で教える。
  const lesson = b.tut && !b.tut.ok && hud.notices.visible('tutorial') && b.tut.items.find(it => !it.done)?.id;
  // 道をふさぐ敵への操作は任務札に一行。押す実物には指だけを添える。
  const routeAttack = !!navigationEnemy(b) && !rain && !hud.retreatGuide?.active && !b.nearestInteract();
  const lessonControl = !linkedAttack && (routeAttack || lesson === 'c_swing') ? T.btn.atk : lesson === 'c_guard' ? T.btn.grd : lesson === 'c_cmd' ? T.btn.cmd : null;
  if (lessonControl && !lessonControl.hidden && !b.over && !b.choice && !p.camShot && !p.radial && !p.cmdOpen && !hud.bigmap && !hud.openingActive) {
    tog(el, 'at-button', false); tog(el, 'control-only', true); tog(el, 'sw', !!S.touchSwap);
    lessonControl.classList.add('coach-now'); T.coachButton = lessonControl;
    T.actionMeasure = (T.actionMeasure || 0) - dt;
    if (T.actionMeasure <= 0 || T.actionControl !== lessonControl || T.lessonSwap !== S.touchSwap) {
      T.actionMeasure = .2; T.actionControl = lessonControl; T.lessonSwap = S.touchSwap;
      const r = lessonControl.getBoundingClientRect();
      el.style.left = (S.touchSwap ? r.right - 2 : r.left - 34) + 'px';
      el.style.top = (r.top + r.height / 2 - 24) + 'px';
    }
    el.hidden = false; T.hint.hidden = true;
    if (linkedAttack) { b.touchCoachActive = true; T.actionKey = ''; }
    return;
  }
  // 敵へ向く操作を先に一つだけ示す。構えや攻撃は向きが合ってから案内する。
  const turnEnemy = !hud?.approachGuideEnemy && hud?.defendEnemy?.alive && !hud.guardFacing ? hud.defendEnemy : null;
  const turnBlocked = b.def.town || b.def.dojo || b.over || !p.u.alive || p.camShot || p.radial || p.cmdOpen || T.sticky ||
    hud.bigmap || hud.openingActive || b.choice || hud.coverEl && !hud.coverEl.hidden ||
    b.nearestInteract() || p.u.wounds?.bleed > .0001 || p.u.hp < p.u.maxHp * .6 ||
    hud.retreatGuide?.active || b.tut && !b.tut.ok || occupied > 3;
  if (turnEnemy && !T.lookLearned && !rain && !turnBlocked) {
    tog(el, 'enemy-turn-coach', true);
    const key = 'turn-enemy';
    if (T.actionKey === key && b.t - (T.coachSeen.get(key) ?? b.t) >= 3) { T.actionKey = ''; return; }
    if (T.actionKey !== key && b.t - (T.coachSeen.get(key) ?? -99) < 8) return;
    if (T.actionKey !== key) { T.actionKey = key; T.coachSeen.set(key, b.t); }
    const yaw = p.yaw + (p.camYawOff || 0);
    const dx = turnEnemy.pos.x - p.u.pos.x, dz = turnEnemy.pos.z - p.u.pos.z;
    const right = -dx * Math.cos(yaw) + dz * Math.sin(yaw) >= 0;
    tog(el, 'turn-coach', true); tog(el, 'at-button', false); tog(el, 'attack-only', false);
    setText(el.lastElementChild, `敵へ向く\n${right ? '右' : '左'}へなぞる`);
    el.style.setProperty('--turn-shift', right ? '40px' : '-40px');
    el.querySelector('.turn-arrow').setAttribute('d', 'M16 6H80M68-6L80 6L68 18');
    el.querySelector('.turn-arrow').setAttribute('transform', right ? '' : 'translate(32 0) scale(-1 1)');
    placeFootCoach(b, el, true);
    el.hidden = false; T.hint.hidden = true; b.touchCoachActive = true;
    // 操作といのちの枠を空け、敵の的は戦場に残す。
    document.getElementById('boss').hidden = true;
    document.getElementById('target').hidden = true;
    T.turnCoachShown = true;
    return;
  }
  // 道の矢印が出る間は、実際に触る側へ指を添える。移動前に向きを合わせる。
  const route = b.missionGuide;
  const path = route?.marker && b.def.guidePath?.(b, route.marker);
  const entrance = route?.marker && b.def.placeFrame?.(b);
  const sign = route?.pos && b.def.routeGuidePriority?.(b) && b.def.routeSignPoint?.(b, route.pos);
  if (!touchMoveLearned(b) && (sign || entrance || path?.length > 1) && !blocked && !rain && !hud.retreatGuide?.active && occupied + Number(!!hud.healthRect) < 3) {
    // 戸口の札を主にし、なぞり方は最初の三秒だけ添える。
    if (b.def.routeDestinationSight) {
      if (T.openingHelp >= 3) { T.actionKey = ''; return; }
      T.openingHelp += dt;
    }
    const goal = sign || path?.[path.length - 1];
    const view = hud.tmpV;
    b.camera.getWorldDirection(view);
    const yaw = Math.atan2(view.x, view.z);
    const dx = (sign ? sign.x : entrance ? (entrance[0].x + entrance[2].x) / 2 : goal.x) - p.u.pos.x;
    const dz = (sign ? sign.z : entrance ? (entrance[0].z + entrance[2].z) / 2 : goal.z) - p.u.pos.z;
    const side = -dx * Math.cos(yaw) + dz * Math.sin(yaw);
    const forward = dx * Math.sin(yaw) + dz * Math.cos(yaw);
    const turn = forward < Math.hypot(dx, dz) * .7, right = side >= 0;
    if (turn && T.lookLearned) return;
    const key = turn ? right ? 'route-right' : 'route-left' : 'route-forward';
    if (T.actionKey === key && b.t - (T.coachSeen.get(key) ?? b.t) >= 3) { T.actionKey = ''; return; }
    if (T.actionKey !== key && b.t - (T.coachSeen.get(key) ?? -99) < 8) return;
    if (T.actionKey !== key) { T.actionKey = key; T.coachSeen.set(key, b.t); }
    tog(el, 'turn-coach', true); tog(el, 'at-button', false); tog(el, 'attack-only', false);
    tog(el, 'move-coach', !turn);
    tog(el, 'route-coach', true);
    setText(el.lastElementChild, turn ? `${right ? '右' : '左'}を向く\n${right ? '右' : '左'}へなぞる` : '旗へ進む\n上へなぞる');
    const arrow = el.querySelector('.turn-arrow');
    arrow.setAttribute('d', turn ? 'M16 6H80M68-6L80 6L68 18' : 'M16 6V-50M4-38L16-50L28-38');
    arrow.setAttribute('transform', turn && !right ? 'translate(32 0) scale(-1 1)' : '');
    const fraction = turn ? S.touchSwap ? .20 : .80 : S.touchSwap ? .75 : .25;
    el.style.left = turn ? `${Math.max(16, Math.min(VIEW.w - 184, VIEW.w * fraction - 84))}px` : `${S.touchSwap ? VIEW.w - 176 : 16}px`;
    el.style.top = `${Math.max(88, VIEW.h - 164)}px`;
    placeFootCoach(b, el, turn);
    el.hidden = false; T.hint.hidden = true; b.touchCoachActive = true;
    // 任務の「あさい川を わたる」は残し、操作の札と二枚で読ませる。
    return;
  }
  // 開幕の操作は一枚にまとめる。演出中・判断中の秒数は案内の八秒に含めない。
  if (!T.moveLearned && (!route?.marker || route.distance >= (route.marker.guideRadius || 8)) && !blocked && !rain && !near && !b.def.town && !b.def.dojo && !b.over && !p.camShot && !b.choice && !p.radial && !p.cmdOpen && !T.sticky && !T.game.hud?.openingActive && !T.game.hud?.bigmap && T.openingHelp < 8) {
    T.openingHelp += dt;
    tog(el, 'move-coach', true);
    tog(el, 'opening-coach', true);
    setText(el.lastElementChild, route?.marker ? '旗へ進む\n上へなぞる' : '前へ進む\n上へなぞる');
    tog(el, 'turn-coach', true); tog(el, 'at-button', false); tog(el, 'attack-only', false);
    el.querySelector('.turn-arrow').setAttribute('d', 'M16 6V-50M4-38L16-50L28-38');
    el.querySelector('.turn-arrow').setAttribute('transform', '');
    el.style.left = `${S.touchSwap ? VIEW.w - 176 : 16}px`;
    el.style.top = `${Math.max(76, VIEW.h - 152)}px`;
    placeFootCoach(b, el, false);
    el.hidden = false; b.touchCoachActive = true; T.hint.hidden = true;
    tog(hud.root, 'touch-travel-coach', !!route?.marker &&
      (route.marker.guideArea === 'wait' || route.marker.guideArea === 'guard' || !!route.marker.waitGuide));
    const old = document.getElementById('tc-move-hint'); if (old) old.hidden = true;
    T.actionMeasure = 0;
    return;
  }
  if (blocked) { T.actionKey = ''; return; }
  if (firstAttack) {
    // 最初の実演の一枠を知らせの束ね役へ渡す。任務や危険の札は残す。
    b.touchCoachActive = true; hud.notices.sync();
    const cards = hud.notices.picks.length + Number(document.getElementById('boss')?.hidden === false) +
      Number(document.getElementById('target')?.hidden === false);
    if (cards >= 3) { b.touchCoachActive = false; return; }
  }
  // 持ち場に着き、敵がまだ遠い間は、構える操作を急がせない。
  if (!rain && compact && !near && b.missionGuide?.marker && b.missionGuide.distance < 8) { T.actionKey = ''; return; }
  // 道の印がある時は移動の札を重ねない。稽古の操作説明は残す。
  if (!rain && !near && b.missionGuide?.marker && !b.def.town && !b.def.dojo) {
    fieldSwipeCoach(b, el);
    if (el.hidden) T.actionKey = '';
    return;
  }
  if (T.moveLearned && !rain && !near) { T.actionKey = ''; return; }
  const move = !!rain || !near && (!b.missionGuide?.marker || b.missionGuide.distance >= 8);
  const enemy = !rain && (T.game.hud?.attackGuideEnemy || b.guideEnemyShown && b.guideEnemy);
  if (enemy && T.attackLearnedBattle === b) { T.actionKey = ''; return; }
  if (enemy) {
    const facing = Math.cos(Math.atan2(enemy.pos.x - p.u.pos.x, enemy.pos.z - p.u.pos.z) - p.yaw);
    if (T.attackEnemy !== enemy) T.attackFacing = false;
    T.attackFacing = T.held.has('atk') || facing > (T.attackFacing ? .85 : .94);
  } else T.attackFacing = false;
  T.attackEnemy = enemy;
  const turn = !!enemy && !T.attackFacing;
  const key = rain ? 'run' : enemy ? 'ally-attack' : move ? 'move' : !p.guardOn && p.weapon !== 'gun' && p.weapon !== 'bow' ? 'guard' : 'attack';
  // 同じ知らせを消して出し直す時は八秒あける。表示中はそのまま保つ。
  if (T.actionKey === key && b.t - (T.coachSeen.get(key) ?? b.t) >= 3) { T.actionKey = ''; return; }
  if (T.actionKey !== key && b.t - (T.coachSeen.get(key) ?? -99) < 8) return;
  if (T.actionKey !== key) { T.actionKey = key; T.coachSeen.set(key, b.t); }
  const control = move ? null : key === 'guard' ? T.btn.grd : T.btn.atk;
  if (control?.hidden) return;
  tog(el, 'at-button', !!control); tog(el, 'sw', !!S.touchSwap);
  // 狙う敵は任務札、押す場所と押し方は実物のボタンの脇で示す。
  const attackOnly = !!enemy;
  tog(el, 'attack-only', attackOnly);
  b.touchCoachActive = true; el.hidden = false;
  T.hint.hidden = true;
  const old = document.getElementById('tc-move-hint'); if (old) old.hidden = true;
  if (T.stick.firstElementChild) T.stick.firstElementChild.style.display = 'none';
  let runText = '';
  if (rain) {
    const yaw = p.yaw + (p.camYawOff || 0);
    const right = -rain.x * Math.cos(yaw) + rain.z * Math.sin(yaw);
    const forward = rain.x * Math.sin(yaw) + rain.z * Math.cos(yaw);
    const dir = (Math.round(Math.atan2(right, forward) / (Math.PI / 4)) + 8) % 8;
    runText = RUN_COACH[dir];
  }
  const attackText = p.weapon === 'gun' ? '押しつづけて うて\nはなすと うつ' :
    p.weapon === 'bow' ? '押してねらい\nはなして射る' : 'ここを押すと攻撃';
  setText(el.lastElementChild, enemy ? (turn ? '敵へ向いて\n' : '') + attackText : key === 'run' ? runText : key === 'move' ? '前へ進もう\nここから上へなぞる' : key === 'guard' ? 'おして かまえる' : p.weapon === 'gun' ? '押しつづけて うて\nはなすと うつ' : attackText);
  if (control) { control.classList.add('coach-now'); T.coachButton = control; }
  // 寸法を読む回数を抑え、左右入替・画面回転にも追従する。
  T.actionMeasure = (T.actionMeasure || 0) - dt;
  if (T.actionMeasure <= 0 || T.actionControl !== control || T.actionTurn !== turn) {
    T.actionMeasure = 0.2; T.actionControl = control; T.actionTurn = turn;
    const width = el.offsetWidth, height = el.offsetHeight;
    const safe = T.safeArea;
    let x, y;
    if (control) {
      const r = control.getBoundingClientRect();
      // 指先を実際の押せる丸へ重ねる。案内自体は指の操作を遮らない。
      x = S.touchSwap ? r.left + r.width / 2 + 22 : r.left + r.width / 2 - width - 22;
      y = r.top + r.height / 2 - 28;
    } else if (turn) {
      x = VIEW.w * (S.touchSwap ? .16 : .56); y = VIEW.h * .48;
    } else {
      x = T.move ? T.move.ox - 30 : T.zoneLeft + 24;
      y = T.move ? T.move.oy - 58 : Math.max(T.zoneTop + 12, VIEW.h * 0.58);
    }
    // 札の実寸と外側の指まで収める。字の拡大や左右入替でも切らない。
    const left = Math.max(8, safe.l + 8) + (control && S.touchSwap ? 36 : 0);
    const right = VIEW.w - Math.max(8, safe.r + 8) - width - (control && !S.touchSwap ? 36 : 0);
    el.style.left = Math.max(left, Math.min(right, x)) + 'px';
    el.style.top = Math.max(62, Math.min(VIEW.h - safe.b - height - 8, y)) + 'px';
  }
}

// 毎コマ同じ値を書き直さない（書くたびに画面の組み直しが起きて、古い端末で重くなる）
// 歩く棒の効く所（左半分。左利きの入れ替えでは右半分）
// 丸の実寸から、歩き始めの範囲を四分の一秒ごとに更新する。
function measureMoveZone(t) {
  if (T.zoneAt > t) return;
  T.zoneAt = t + 0.25;
  const sa = T.safeArea, sw = !!S.touchSwap;
  T.zoneLeft = Math.max(16, sa.l + 8); T.zoneRight = VIEW.w - Math.max(16, sa.r + 8);
  T.zoneTop = sa.t; T.zoneBottom = VIEW.h - sa.b - 8;
  for (let i = 0; i < BTN.length; i++) {
    const el = T.btn[BTN[i].id], r = T.zoneRects[i]; r.on = !el.hidden;
    if (!r.on) continue;
    const box = el.getBoundingClientRect();
    r.left = box.left - 8; r.right = box.right + 8; r.top = box.top - 8; r.bottom = box.bottom + 8;
  }
  if (sw) T.zoneLeft = VIEW.w / 2; else T.zoneRight = VIEW.w / 2;
  for (const r of T.zoneBlocks) {
    r.on = !!r.el && !r.el.hidden && r.el.scrollHeight > r.el.clientHeight + 1;
    tog(r.el, 'tc-scroll', r.on); if (!r.on) continue;
    const box = r.el.getBoundingClientRect(); r.on = box.width > 0 && box.height > 0;
    r.left = box.left - 8; r.right = box.right + 8; r.top = box.top - 8; r.bottom = box.bottom + 8;
  }
  const zone = document.getElementById('tc-mzone');
  // 同じ値は書かない（書くと次に大きさを読む所で配置のやり直しが起きる）
  const st = (el, k, v) => { if (el.style[k] !== v) el.style[k] = v; };
  st(zone, 'left', T.zoneLeft + 'px'); st(zone, 'right', 'auto'); st(zone, 'top', T.zoneTop + 'px'); st(zone, 'bottom', 'auto');
  st(zone, 'width', Math.max(0, T.zoneRight - T.zoneLeft) + 'px'); st(zone, 'height', Math.max(0, T.zoneBottom - T.zoneTop) + 'px');
  const hint = document.getElementById('tc-move-hint');
  // 歩き出さない人にも、案内は始めの20秒だけ（出続けて画面を塞がない）
  const hh = true; // 操作の説明は指の札へまとめる。
  if (hint.hidden !== hh) hint.hidden = hh;
  setText(hint, sw ? '右の好きな所から歩く' : '左の好きな所から歩く');
  st(hint, 'left', (T.zoneLeft + 8) + 'px'); st(hint, 'top', Math.max(T.zoneTop + 8, VIEW.h * 0.55) + 'px');
  st(hint, 'maxWidth', Math.max(0, T.zoneRight - T.zoneLeft - 32) + 'px');
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
function coachText(text) {
  if (/構え|かまえ|ふせぐ|ふせげ/.test(text)) return '';
  return text.split('\n').map(line => {
    const parts = line.match(/[^ 、。]+[ 、。]*/g) || [''];
    let out = '', row = '';
    for (let part of parts) {
      if (row.length + part.trimEnd().length > 12 && row) { out += row.trimEnd() + '\n'; row = ''; }
      // 空白のない文も、助詞・読点の後で文節を保って切る。
      while (part.trimEnd().length > 12) {
        const head = part.slice(0, 12), boundary = /.*[でをにはへと、。]/.exec(head);
        const end = boundary ? boundary[0].length : 12;
        out += part.slice(0, end).trimEnd() + '\n'; part = part.slice(end).trimStart();
      }
      row += part;
    }
    return out + row.trimEnd();
  }).join('\n');
}
function setText(el, t) {
  if (!el) return;
  if (el.parentElement === T.actionCoach || el === T.hint) {
    if (el._coachSource === t) return;
    el._coachSource = t; t = coachText(t);
  }
  if (el.textContent !== t) el.textContent = t;
}
function setCss(el, name, value) { if (el.style.getPropertyValue(name) !== value) el.style.setProperty(name, value); }
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
  const cur = coachAllowed(b) && t && !t.ok && b.hud.notices.visible('tutorial') ? t.items.find((x) => !x.done) : null;
  const id = cur && !(touchMoveLearned(b) && ['c_move', 'move', 'run'].includes(cur.id)) ? cur.id : '';
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
  input.keys.delete('Tab'); input.keys.delete('KeyE'); input.keys.delete('TreatWound'); input.keys.delete('AltLeft');
  input.runHeld = false; input.axis = null; input.dx = input.dy = input.touchDx = input.touchDy = 0;
  for (const key of TOUCH_EDGES) input.edge.delete(key);
  T.runLatch = false; T.more = false; T.moreT = 0; T.stickyT = 0; T.axis.x = T.axis.y = 0;
  document.documentElement.classList.remove('tc-cmd');
  T.move = null; T.looks.clear(); T.held.clear(); T.sticky = false; T.radialDrag = null;
  T.root.querySelectorAll('.tb').forEach((el) => { el.classList.remove('on'); el._o = null; el._keyHeld = false; el._cancelClick = true; });
  if (T.hint) T.hint.hidden = true;
  if (T.actionCoach) T.actionCoach.hidden = true;
  if (T.coachButton) T.coachButton.classList.remove('coach-now');
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
  // 外へ8点出る溜めの輪も含め、隣の操作との間を8点以上あける。
  const gap = Math.max(24, 8 + Math.ceil(12 * k));
  if (T.rotOk && innerHeight > innerWidth * 1.05) {
    const available = innerWidth - sa.l - sa.r - 32;
    // 主な丸は64点。狭い縦画面でも間は保ち、大きな丸だけ縮める。
    let lo = 0, hi = k;
    for (let i = 0; i < 12; i++) {
      const mid = (lo + hi) / 2;
      const width = Math.max(96, Math.ceil(84 * mid)) + Math.max(64, Math.ceil(64 * mid)) + Math.max(44, Math.ceil(56 * mid)) + Math.max(44, Math.ceil(48 * mid)) + gap * 3 + Math.ceil(12 * mid);
      if (width <= available) lo = mid; else hi = mid;
    }
    k = lo;
  }
  // 左利きの入れ替え：丸は左下、歩く棒は右へ（丸の並びも左右を裏返す）
  const sw = !!S.touchSwap;
  // 列と段の幅は配置を変える時だけ計算する。
  const cols = [0, 0, 0, 0], rows = [0, 0, 0];
  for (const d of BTN) {
    if (d.id === 'treat') continue;
    const s = Math.ceil(Math.max(d.id === 'use' && T.layoutGate ? 48 : d.id === 'atk' ? 96 : d.id === 'grd' || d.id === 'dodge' ? 64 : 44, d.d * k));
    cols[d.col] = Math.max(cols[d.col], T.layoutGate && d.id === 'use' ? Math.max(120, s) : s);
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
    // 手当ては歩く親指の側へ独立して置き、門や拾う操作と同時に見せる。
    if (d0.id === 'treat') {
      const el = T.btn.treat;
      el.style.width = '96px'; el.style.height = '80px';
      const inset = innerWidth > innerHeight ? T.game.battle?.def.treatmentControlInset ?? 16 : 16;
      el.style.left = (sw ? innerWidth - sa.r - 96 - inset : sa.l + inset) + 'px';
      // 戦が指定した分だけ持ち上げ、出血中に背の高くなる命の札を避ける。
      T.treatLeft = sw ? innerWidth - sa.r - 96 - inset : sa.l + inset;
      T.treatBase = Math.max(sa.t + 112, bottom - 152 - (T.game.battle?.def.treatmentControlLift || 0));
      T.treatMin = sa.t + 112; T.treatTop = null;
      el.style.top = T.treatBase + 'px';
      continue;
    }
    // 城下では「入る」の丸を、突くの場所に突くの大きさで置く（親指の真下）
    const d = T.town && d0.id === 'use' ? { ...d0, col: 0, row: 0, d: 84 } : d0;
    const el = T.btn[d.id];
    if (d.id === 'use') el.classList.toggle('big', !!T.town);
    const s = Math.ceil(Math.max(d.id === 'use' && T.layoutGate ? 48 : d.id === 'atk' ? 96 : d.id === 'grd' || d.id === 'dodge' ? 64 : 44, d.d * k)); // 押せる所は 44px 以上を必ず確保
    const width = T.layoutGate && d.id === 'use' ? Math.max(120, s) : s;
    el.style.width = width + 'px'; el.style.height = s + 'px';
    // 攻めを頂点に、構えと回避を少し内側へ寄せた親指の弧。
    const arc = d.id === 'grd' || d.id === 'dodge' ? 12 * k : 0;
    const x = xs[d.col] + (cols[d.col] - width) / 2 + (d.id === 'grd' ? arc : 0);
    el.style.left = (sw ? edge + x : edge - x - width).toFixed(0) + 'px';
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
