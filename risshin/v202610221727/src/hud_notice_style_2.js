export const noticeStyle3 = `
/* 任務は上端、名前は人物の上。画面の中央を戦場へ空ける。 */
html body #hud.mission-visible #battle-notices:not(.choosing):not(:has(#objectives.expand)) {
 top:calc(12px + env(safe-area-inset-top, 0px)) !important;
 left:auto !important; right:calc(76px + env(safe-area-inset-right, 0px)) !important;
 bottom:auto !important; max-height:25vh !important;
}
/* 共通の任務札は本文・補足・距離を縦に積む。本文の幅を他の行へ分けない。 */
html body #hud :is(#battle-notices,#choice-tasks) #objectives:not(.expand) li.cur {
 display:block !important; width:100% !important; min-width:0 !important;
 box-sizing:border-box; height:auto !important; max-height:none !important;
}
html body #hud :is(#battle-notices,#choice-tasks) #objectives:not(.expand) li.cur :is(.obj-text,.obj-now,small) {
 width:auto !important; min-width:0 !important; max-width:100% !important;
 white-space:normal !important; overflow-wrap:anywhere !important; word-break:normal !important;
 height:auto !important; max-height:none !important; overflow:visible !important; line-height:1.4 !important;
}
html body #hud :is(#battle-notices,#choice-tasks) #objectives:not(.expand) li.cur .obj-text {
 display:block !important; width:100% !important;
}
/* 「今」だけの行と重複する種別札を省き、行動を札の先頭から読む。 */
html body #hud :is(#battle-notices,#choice-tasks) #objectives:not(.expand) li.cur::before { content:none !important; }
html body #hud :is(#battle-notices,#choice-tasks) #objectives:not(.expand) li.cur .tag { display:none !important; }
/* 岩村の携帯横向きは、後の共通配置にも負けず左上で進路を空ける。 */
@media (min-width:601px) and (max-height:500px) {
 html.touch body #hud.iwamura.mission-visible #battle-notices:not(.choosing):not(:has(#objectives.expand)) {
  top:calc(12px + env(safe-area-inset-top, 0px)) !important;
  left:calc(200px + env(safe-area-inset-left, 0px)) !important; right:auto !important;
  width:min(280px, calc(40vw - 84px - env(safe-area-inset-left, 0px))) !important;
  /* 戻る下知が二行になっても、距離まで札の中へ収める。 */
  max-height:calc(100% - 12px - env(safe-area-inset-top, 0px) - max(104px, var(--notice-floor, 104px))) !important;
  overflow-y:auto;
 }
 html.touch body #hud.iwamura #battle-notices:not(.choosing) #objectives:not(.expand) {
  flex:0 0 auto !important; max-height:none !important; overflow:visible !important;
 }
 html.touch body #hud.iwamura #battle-notices:not(.choosing) #objectives:not(.expand) li.cur small.goal-place {
  font-size:max(13px, calc(13px * var(--text-scale, 1))) !important; line-height:1.4 !important;
 }
 html.touch body #hud.iwamura #battle-notices:not(.choosing) #objectives:not(.expand) li.cur,
 html.touch body #hud.iwamura #battle-notices:not(.choosing) #objectives:not(.expand) li.cur :is(.obj-now,.battle-action) {
  font-size:max(16px, calc(16px * var(--text-scale, 1))) !important;
 }
}
/* 岩村の縦に余裕がある画面は、任務と使番の声を左で積み、小地図を空ける。 */
@media (min-height:501px) {
 html body #hud.iwamura #battle-notices:not(.choosing):not(:has(#objectives.expand)),
 html body #hud.iwamura #battle-notices:not(.choosing) {
  top:104px !important; left:16px !important; right:auto !important;
  width:min(320px, 30vw) !important; max-height:calc(100% - 304px) !important;
 }
 html body #hud.iwamura #battle-notices:not(.choosing) > :is(#objectives,#battle-message,#tutorial,#banner,#situation,#skiphint) {
  position:relative !important; inset:auto !important; transform:none !important;
  width:100% !important; height:auto !important; min-width:0; flex:0 0 auto;
  max-height:none !important; white-space:normal; overflow-wrap:anywhere;
 }
}
/* 岩村では接敵の操作中も柵の持ち場を同じ札で読む。共通の頭上案内で任務を隠さない。 */
/* 点火中は作業札へ一本化する。後の任務表示指定にも勝ち、空の黒帯を重ねない。 */
html body #hud.iwamura.working #battle-notices:not(.choosing) #objectives:not(.expand) {
 display:none !important;
}
html body #hud.iwamura #battle-notices:not(.choosing) #objectives.keep-combat-task:not(.expand) {
 background:rgba(20,18,15,.9) !important; padding:6px 10px !important;
}
html body #hud.iwamura #battle-notices:not(.choosing) #objectives.keep-combat-task:not(.expand) #obj-list,
html body #hud.iwamura #battle-notices:not(.choosing) #objectives.keep-combat-task:not(.expand) #obj-list li.cur .obj-text {
 display:block !important;
}
html body #hud.iwamura #battle-notices:not(.choosing) #objectives.keep-combat-task:not(.expand) #obj-list li.cur .obj-now {
 display:block !important; font-size:max(16px, calc(16px * var(--text-scale, 1))) !important;
 line-height:1.4 !important; max-height:none !important; overflow:visible !important;
}
#hud #prompt [data-talk] { min-width:104px; min-height:52px; font-size:32px; font-weight:900; color:#fff3ba; background:#14120f; border:2px solid #fff3ba; }
/* 相手の頭上の吹き出し全体を押せる一枚にする。 */
html body #hud #prompt.talk-target {
 left:var(--talk-x) !important; top:var(--talk-y) !important; bottom:auto !important;
 width:var(--talk-w); height:var(--talk-h); transform:none !important;
 padding:0; border:0; background:none; overflow:visible;
}
html body #hud #prompt.talk-target [data-talk] {
 position:relative; display:flex; align-items:center; justify-content:center; gap:8px; box-sizing:border-box; width:100%; height:100%; min-width:44px; min-height:44px;
 padding:6px 10px; border:3px solid #14120f; border-radius:8px; background:#fff3ba; color:#14120f;
 box-shadow:0 0 0 2px #fff3ba; pointer-events:auto; cursor:pointer; touch-action:manipulation;
}
#hud #prompt.talk-target [data-talk]::after {
 content:""; position:absolute; left:calc(var(--talk-tip-x, 50%) - 8px); bottom:-12px;
 width:14px; height:14px; background:#fff3ba; border-right:3px solid #14120f; border-bottom:3px solid #14120f; transform:rotate(45deg);
}
#hud #prompt.talk-target .talk-label { display:block; font-size:20px; line-height:1.4; white-space:nowrap; }
#hud #prompt.talk-target .talk-label strong { display:block; font-size:24px; }
#hud #prompt [data-talk] svg { width:40px; height:44px; vertical-align:middle; }

html body #hud:is(.retreat-priority,.dodge-active) :is(#prompt,#markers,.cover-guide) { visibility:hidden !important; }
/* 回避中は行き先一組だけ。敵の札は次の更新を待たずに隠す。 */
html body #hud:is(.retreat-priority,.dodge-active) :is(#target,#boss,.range-cue) { visibility:hidden !important; }
html body #hud.rain-danger :is(#prompt,#markers,.cover-guide,#objectives) { visibility:hidden !important; }
html body #hud:is(.rain-danger,.dodge-active) #objectives:not(.expand) :is(#obj-list,.battle-action,.victory-condition) { display:none !important; }
html body #hud #markers .mk.main.person-goal svg { display:block; order:2; flex:none; width:48px; height:56px; margin:auto; }
html body #hud #markers .mk.main.person-goal::before,
html body #hud #markers .mk.main.person-goal:not(.edge)::after { display:none !important; }
html body #hud #markers .mk.main.person-goal b { display:block; padding:6px 10px; border:2px solid #fff3ba; font-size:max(28px, calc(28px * var(--text-scale, 1))) !important; font-weight:900; line-height:1.4; color:#fff3ba; background:#14120f; }
html body #hud #markers .mk.main.person-goal b[hidden] { display:none !important; }
html body #hud #markers .mk.main.person-goal small { font-size:15px; line-height:1.4; }
html body #hud #markers .mk.main.person-goal:not(.edge) { padding:0; border:0; background:none; box-shadow:none; font-size:38px; line-height:1; }
html body #hud #markers .mk.main.person-goal { display:flex; flex-direction:column; align-items:center; width:max-content; max-width:220px; }
html body #hud #markers .mk.main.person-goal b[hidden] { display:none !important; }
html body #hud #markers .mk.main.person-goal small { order:1; }
html body #hud #markers .mk.main.person-goal.edge svg { order:0; }
/* 命は一本の塗りと目盛り。空いた部分が減った命を表す。 */
html body #hud:not(.ending) .bl, html body #hud:not(.ending) .bl.full { opacity:1; }
html body #hud .bl #h-hp { display:grid !important; grid-template-columns:max-content minmax(0,1fr) !important; width:max(224px,calc(208px * var(--text-scale,1) + 16px)); box-sizing:border-box; align-items:center; gap:4px 12px; padding:6px 8px; background:#14120f; color:#fff; }
html body #hud .bl #h-hp span { display:block !important; grid-column:1; grid-row:1; white-space:nowrap; word-break:keep-all; color:#fff; font-size:max(18px,calc(18px * var(--text-scale,1))) !important; font-weight:700; line-height:1.3; }
html body #hud .bl #h-hp.hp i { grid-column:1 / -1; grid-row:2; position:relative; display:block; height:20px !important; box-sizing:border-box; border:2px solid #fff; padding:2px; background:#14120f; box-shadow:none; mask:none; -webkit-mask:none; overflow:hidden; }
html body #hud .bl #h-hp i::after { content:none; }
html body #hud .bl #h-hp i strong { position:absolute; display:block; inset:2px; width:auto; height:auto; background:#fff; transform:scaleX(var(--hp-ratio,1)); transform-origin:left center; }
/* 傷は命の札の中にまとめ、点滅や色がなくても気づける形にする。 */
html body #hud .bl #h-hp:is(.blood-loss,.deep) { border:2px solid #fff3ba; box-shadow:0 0 0 2px #14120f; }
html body #hud .bl #h-hp:is(.blood-loss,.deep) em { color:#fff3ba !important; font-weight:800; letter-spacing:0; }
/* 残りの命と傷を別の行で読む。満身でも前の戦の傷は残る。 */
html body #hud .bl #h-hp .hp-remaining { grid-column:2; grid-row:1; justify-self:end; font-size:max(18px,calc(18px * var(--text-scale,1))); font-weight:800; white-space:nowrap; }
html body #hud .bl #h-hp em,
html body #hud .bl #h-hp:is(.blood-loss,.deep) em { grid-column:1 / -1; grid-row:3; justify-self:start; display:block !important; font-size:max(18px,calc(18px * var(--text-scale,1))) !important; font-weight:800; line-height:1.4; white-space:normal; font-style:normal; text-align:left; min-width:0; max-width:100%; overflow-wrap:anywhere; box-sizing:border-box; color:#fff !important; background:#14120f; letter-spacing:0; }
/* 鳥取の傷は大きな字を保ち、長い説明を札の幅で折り返す。 */
html body #hud.tottori .bl #h-hp.hp em { font-size:max(22px,calc(22px * var(--text-scale,1))) !important; overflow-wrap:anywhere; word-break:normal; }
html body #hud .bl #h-hp em[hidden] { display:none !important; }
html body #hud .bl #h-hp em small { display:block; font-size:inherit; }
html body #hud #objectives .destination-cue { display:inline-flex; align-items:center; gap:6px; margin-right:8px; white-space:nowrap; color:#fff3ba; }
html body #hud #objectives .destination-cue small { display:inline !important; font-size:max(18px,calc(18px * var(--text-scale,1))) !important; font-weight:800; }
html body #hud #objectives.unified-destination:not(.expand) li.cur .obj-now::before { content:none !important; }
html body #hud .bl #h-hp em svg { width:26px; height:28px; vertical-align:middle; margin-right:4px; }
html body #hud.lean .bl, html.touch.tc-low body #hud .bl { width:max(224px,calc(208px * var(--text-scale,1) + 16px)); max-width:calc(100vw - 32px); }
/* 岩村の横画面では傷の長い文で列幅を押し広げず、命の札の中で折り返す。 */
html body #hud.iwamura .bl #h-hp.hp { grid-template-columns:max-content minmax(0,1fr) !important; max-width:100%; }
html body #hud.iwamura .bl #h-hp.hp :is(i,em) { min-width:0; max-width:100%; box-sizing:border-box; }
html body #hud.iwamura .bl #h-hp.hp em { justify-self:stretch; font-size:max(18px,calc(18px * var(--text-scale,1))) !important; overflow-wrap:anywhere; word-break:normal; }
html body #hud #objectives.travel-retreat:not(.expand) :is(.battle-action,.victory-condition,li.cur small,.obj-tag) { display:none !important; }
html body #hud #battle-notices #objectives.travel-retreat:not(.expand) #obj-list { display:block !important; }
html body #hud #battle-notices #objectives.travel-retreat:not(.expand) li.cur .obj-now { display:block !important; font-size:max(28px, calc(28px * var(--text-scale, 1))) !important; font-weight:900; }
html body #hud #objectives.travel-retreat:not(.expand) li.cur .obj-now::before { content:none !important; }
/* 札は旗、進む向きは床の矢印で示す。 */
html body #hud #battle-notices #objectives.destination-sign:not(.expand) li.cur .obj-now::before {
 content:none !important;
}
/* 入口と任務札に同じ門形を使う。 */
html body #hud #battle-notices #objectives.place-destination:not(.expand) li.cur .obj-now::before {
 content:'' !important; display:inline-block; width:24px; height:28px; margin-right:8px; vertical-align:middle;
 background:#fff3ba; clip-path:polygon(0 26%,50% 0,100% 26%,86% 26%,86% 100%,67% 100%,67% 43%,33% 43%,33% 100%,14% 100%,14% 26%);
}
/* 行き先は大きな矢印一つ。画面外では同じ矢印を行き先へ向ける。 */
html body #hud #markers .mk.main.direction-only {
 width:36px !important; height:40px !important; min-width:0 !important; max-width:36px !important;
 padding:0 !important; border:0 !important; background:none !important; box-shadow:none !important;
}
html body #hud #markers .mk.main.direction-only::before { display:none !important; }
html body #hud #markers .mk.main.direction-only::after {
 content:'' !important; display:block; position:absolute; inset:0 !important; width:36px; height:40px;
 border:0 !important; background:#fff3ba; clip-path:polygon(35% 0,65% 0,65% 55%,95% 55%,50% 100%,5% 55%,35% 55%);
 transform:none !important; filter:none;
}
html body #hud #markers .mk.main.direction-only .destination-chip { position:absolute; bottom:44px; left:50%; transform:translateX(-50%); display:flex; align-items:center; gap:4px; padding:3px 6px; white-space:nowrap; color:#fff3ba; background:#14120f; font-size:18px; font-weight:bold; }
html body #hud #markers .mk.main.direction-only .destination-chip svg { width:22px; height:26px; }
html body #hud #markers .mk.main.direction-only { filter:drop-shadow(0 0 2px #14120f) drop-shadow(0 0 1px #14120f); }
html body #hud #markers .mk.main.direction-only.edge::after { transform:rotate(calc(var(--ang) - 1.5708rad)) !important; }
#hud #objectives.destination-order:not(.flag-order):not(.expand) li.cur .obj-now::before,
#hud #battle-notices .battle-notice.warn.cover-advice::before,
#hud .battle-action.cover-action::before { content:'◆ '; color:#fff3ba; }
html body #hud #markers .mk.main.direction-only .way-turn {
 position:absolute; top:40px; left:50%; transform:translateX(-50%); padding:2px 4px;
 color:#fff3ba; background:#14120f; font-size:15px; line-height:1.4; white-space:nowrap;
}
#hud #objectives.flag-order:not(.expand) li.cur .obj-now::before { content:'◇ '; color:#fff3ba; }
#hud #objectives.wait-order:not(.expand) li.cur .obj-now::before {
 content:''; display:inline-block; width:28px; height:12px; margin-right:8px;
 border:3px solid #fff3ba; border-radius:50%; vertical-align:middle;
}
/* 回避先のひし形と競う照準・気力の輪を隠す。 */
html body #hud.dodge-active :is(#crosshair,#staring,.stamina-cue) { visibility:hidden !important; }
/* 移動先と話す相手を示す間は、中央の白い照準を重ねない。 */
html body #hud:is(.flag-guide,.person-guide,.travel-guide) #crosshair { visibility:hidden !important; }
html body #hud.single-guide :is(.combat-cue-label,.range-cue) { visibility:hidden !important; }
html body #hud.single-guide #battle-notices #objectives:not(.expand) li.cur :is(.obj-now,.obj-text) {
 font-size:max(16px, calc(16px * var(--text-scale, 1))) !important; line-height:1.4 !important;
}
html body #hud.single-guide #battle-notices #objectives:not(.expand) li.cur .obj-now::before { display:none !important; }
/* 地面の案内は任務札そのものを輪の外へ移す。押せる高さを保つ。 */
html body #hud #battle-notices:not(.choosing) #objectives.ground-order:not(.expand) {
 position:fixed !important; inset:auto !important;
 left:var(--ground-order-x) !important; top:var(--ground-order-y) !important;
 width:max-content !important; max-width:min(240px, 40vw) !important;
 min-height:44px !important; max-height:none !important; transform:none !important;
 overflow:visible !important; margin:0 !important;
}
html body #hud #battle-notices #objectives.ground-order:not(.expand) #obj-list li.cur :is(.obj-text,.obj-now) {
 font-size:max(24px, calc(24px * var(--text-scale, 1))) !important; line-height:1.4 !important;
}
html.touch body #hud #battle-notices #objectives.ground-order:not(.expand) li.cur .obj-now {
 white-space:normal !important; overflow-wrap:anywhere !important;
}
html.touch body #hud #battle-notices #objectives.entrance-order:not(.expand) li.cur .obj-now {
 white-space:nowrap !important; overflow-wrap:normal !important;
}
/* 志賀は敵の印が出ても持ち場の指図を残す。携帯の細い札でも末尾を切らない。 */
html.touch body #hud.shiga #battle-notices #objectives:not(.expand) li.cur :is(.obj-text,.obj-now) {
 min-width:0; max-width:100%; white-space:normal !important; overflow-wrap:anywhere !important;
 overflow:visible !important; text-overflow:clip;
}
html body #hud #battle-notices #objectives.travel-retreat.ground-order:not(.expand) {
 width:max-content !important; max-width:min(320px, calc(100vw - 24px)) !important;
 background:#14120f !important; color:#fff3ba; padding:6px 10px !important;
}
html body #hud #battle-notices #objectives.travel-retreat.ground-order:not(.expand) li.cur .obj-now {
 font-size:max(18px, calc(18px * var(--text-scale, 1))) !important;
 white-space:normal !important; overflow-wrap:anywhere !important;
}
html body #hud #battle-notices #objectives.travel-retreat.ground-order:not(.expand) li.cur .obj-text {
 flex:0 0 auto !important;
}
/* 志賀・田野の任務と警告は同じ欄で縦に並べ、地図と画面の外へ張り出さない。 */
html body #hud:is(.shiga,.tano) #battle-notices:not(.choosing) #objectives.ground-order:not(.expand) {
 position:relative !important; inset:auto !important; width:100% !important;
 max-width:100% !important; min-width:0 !important;
}
html body #hud:is(.shiga,.tano) #battle-notices:not(.choosing) #objectives:not(.expand) li.cur :is(.obj-text,.obj-now) {
 min-width:0; max-width:100%; white-space:normal !important; overflow-wrap:anywhere !important;
 word-break:normal !important; overflow:visible !important; text-overflow:clip;
}
/* 田野の合図・距離は本文の下へ。一文字幅の列と固定位置の札を作らない。 */
html body #hud.tano #battle-notices:not(.choosing) > :is(#objectives,#battle-message,#tutorial,#banner,#situation,#skiphint) {
 position:relative !important; inset:auto !important; transform:none !important;
 width:100% !important; min-width:0 !important; max-width:100% !important;
 height:auto !important; max-height:none !important; flex:0 0 auto; box-sizing:border-box;
}
html body #hud.tano #battle-notices #objectives:not(.expand) li.cur {
 display:block !important; width:100% !important; min-width:0 !important;
 height:auto !important; max-height:none !important; box-sizing:border-box;
}
html body #hud.tano #battle-notices #objectives:not(.expand) li.cur :is(.obj-text,.obj-now,small) {
 display:block; width:auto !important; min-width:0 !important; max-width:100% !important;
 height:auto !important; max-height:none !important; white-space:normal !important;
 overflow-wrap:anywhere !important; word-break:normal !important; overflow:visible !important; line-height:1.4 !important;
}
@media (min-height:501px) {
 /* 田野は移動・集合の任務が出ても、この欄を小地図の上へ戻さない。 */
 html body #hud.tano.mission-visible #battle-notices:not(.choosing):not(:has(#objectives.expand)),
 html body #hud:is(.shiga,.tano) #battle-notices:not(.choosing) {
  left:auto !important; right:calc(208px + env(safe-area-inset-right, 0px)) !important;
  top:104px !important; width:min(320px, 30vw) !important; max-height:calc(100% - 304px) !important;
 }
 /* 本文を広げて人物紹介の半行切れを避ける。低い画面は既存の送りを使う。 */
 #hud #intro[data-battle="shiga"]:has(#intro-go) > .card {
  height:min(680px, calc(100dvh - 176px));
 }
}
@media (max-height:500px) {
 html body #hud:is(.shiga,.tano) #battle-notices:not(.choosing) {
  left:calc(76px + env(safe-area-inset-left, 0px)) !important; right:auto !important;
  top:calc(96px + env(safe-area-inset-top, 0px)) !important;
  max-height:calc(100% - 196px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)) !important;
 }
}
/* 伊賀の指図と台詞は同じ欄に収め、固定位置の札が重なって切れないようにする。 */
html body #hud.iga #battle-notices:not(.choosing) > :is(#objectives,#battle-message),
html body #hud.iga #battle-notices:not(.choosing) #objectives.ground-order:not(.expand) {
 position:relative !important; inset:auto !important; width:100% !important;
 min-width:0 !important; max-width:100% !important; box-sizing:border-box;
 transform:none !important;
}
html body #hud.iga #battle-notices #objectives:not(.expand) :is(li.cur,.obj-text,.obj-now,.battle-action) {
 min-width:0; max-width:100%; height:auto !important;
 white-space:normal !important; overflow-wrap:anywhere !important;
 word-break:normal !important; overflow:visible !important; text-overflow:clip;
 line-height:1.4 !important;
}
@media (min-height:501px) {
 html body #hud.iga #battle-notices:not(.choosing) {
  left:auto !important; right:calc(208px + env(safe-area-inset-right, 0px)) !important;
  top:104px !important; width:min(320px, 30vw) !important; max-height:calc(100% - 304px) !important;
 }
 html body #hud.iga #prompt.work-action:not([hidden]) { bottom:calc(104px + env(safe-area-inset-bottom, 0px)); }
}
@media (max-height:500px) {
 html body #hud.iga #battle-notices:not(.choosing) {
  left:calc(76px + env(safe-area-inset-left, 0px)) !important; right:auto !important;
  top:calc(96px + env(safe-area-inset-top, 0px)) !important;
  width:min(280px, 34vw) !important;
  max-height:calc(100% - 196px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)) !important;
 }
}
/* 今の操作が出ている間は、待機や移動の指図を同じ札へ重ねない。一覧では読める。 */
html body #hud #battle-notices #objectives.has-action:not(.expand):has(.battle-action:not([hidden])) > :not(.battle-action) { display:none !important; }
/* 長い指図も札の幅で折り返し、端まで読めるようにする。 */
html body #hud #battle-notices #objectives:not(.expand) :is(.obj-text,.obj-now,.battle-action) {
 min-width:0; max-width:100%; white-space:normal; overflow-wrap:anywhere;
}
/* 鳥取の低い画面では、任務の三行目を共通の高さ制限で切らない。 */
@media (max-height:500px) {
 html body #hud.tottori.mission-visible #battle-notices:not(.choosing):not(:has(#objectives.expand)) {
  max-height:33vh !important;
 }
 html body #hud.tottori #battle-notices:not(.choosing) > #objectives:not(.expand) {
  position:relative !important; inset:auto !important; transform:none !important;
  width:100% !important; height:auto !important; max-height:none !important;
  flex:0 0 auto; box-sizing:border-box;
 }
 /* 行き先は本文と地面の印に残し、重複する一文字の行を増やさない。 */
 html body #hud.tottori #battle-notices:not(.choosing) #objectives:not(.expand) li.cur small.goal-place:not([hidden]) {
  display:none !important;
 }
}
/* 頭上・旗の案内が出ている間は、同じ指図を上の札に重ねない。記録と任務一覧は残す。 */
html body #hud:is(.flag-guide,.person-guide) #objectives:not(.expand) :is(#obj-list,.battle-action,.victory-condition) { display:none !important; }
html body #hud:is(.guard-guide,.flag-guide,.person-guide) #battle-notices #objectives:not(.expand) {
 background:none !important; border:0 !important; box-shadow:none !important; padding:0 !important; min-height:0 !important;
}
/* 旗の布の実寸を白枠で囲む。画面外では矢印と短い一言だけ。 */
html body #hud #markers .mk.main.flag-goal:not(.edge) {
 padding:4px 8px; border:0; background:#14120f;
}
html body #hud #markers .mk.main.flag-goal b { font-size:max(28px, calc(28px * var(--text-scale, 1))) !important; white-space:nowrap; }
html body #hud #markers .mk.main.flag-goal.flag-framed:not(.edge)::after { display:none !important; }
#hud .goal-flag-frame {
 position:absolute; top:calc(100% + var(--flag-y, 0px)); left:calc(50% + var(--flag-x, 0px)); width:var(--flag-width, 52px); height:var(--flag-height, 64px);
 overflow:visible; pointer-events:none;
}
#hud .goal-flag-frame > svg { display:block; width:100%; height:100%; overflow:visible; }
#hud .goal-flag-frame > svg.goal-flag-arrow { position:absolute; left:50%; top:-56px; width:42px; height:52px; transform:translateX(-50%); }
#hud .mk.edge .goal-flag-frame { display:none; }
html body #hud #markers .mk.main.person-goal .goal-flag-frame > svg { width:100%; height:100%; margin:0; }
html body #hud #markers .mk.main.person-goal .goal-flag-frame > svg.goal-flag-arrow { width:42px; height:52px; }

/* 行き先の札には常に行動を書く。地面の囲みは共通の描画へ。 */
#hud .cover-guide { width:max-content; max-width:min(200px, 30vw); padding:6px 10px; border:0; box-shadow:none; }
#hud .cover-guide::before { display:none; }
#hud .cover-guide::after { display:none; }
#hud .cover-guide.edge::after { content:"➤"; display:inline-block; margin:0 0 0 8px; transform:rotate(var(--ang)); font-size:20px; line-height:24px; }
#hud button.cover-guide.hold-cover { display:flex; align-items:center; justify-content:center; gap:8px; box-sizing:border-box; white-space:pre-line; width:204px; height:auto; min-width:44px; min-height:64px; padding:8px; border:3px solid #fff3ba; border-radius:12px; background:#373326; box-shadow:0 0 0 3px #14120f, inset 0 -6px 0 #14120f; transform:none; right:calc(24px + env(safe-area-inset-right, 0px)); bottom:calc(128px + env(safe-area-inset-bottom, 0px)); pointer-events:auto; touch-action:none; cursor:pointer; }
#hud button.cover-guide.hold-cover span { position:static; flex:1; min-width:0; padding:0; color:#fff3ba; font:800 16px/1.4 var(--ui); white-space:pre; pointer-events:none; }
#hud button.cover-guide.hold-cover svg { flex:none; width:44px; height:48px; pointer-events:none; }
#hud button.cover-guide.hold-cover svg + svg { display:none; }
#hud button.cover-guide.hold-cover::after { display:none; }
#hud button.cover-guide.hold-cover.edge::after { display:none; }
html.tc-sw #hud button.cover-guide.hold-cover.edge::after { right:auto; left:calc(100% + 16px); }
#hud button.cover-guide.hold-cover[aria-pressed="true"] { background:#493f2c; box-shadow:0 0 0 3px #14120f, inset 0 4px 0 #14120f; }
#hud button.cover-guide.hold-cover:focus-visible { outline:3px solid #fff3ba; outline-offset:5px; }
html.tc-sw #hud button.cover-guide.hold-cover { right:auto; left:calc(16px + env(safe-area-inset-left, 0px)); }
html.tc-sw #hud button.cover-guide.hold-cover span { right:auto; left:0; }
/* 戻る案内へまとめた任務は空の下地も消す。有岡は持ち場と期限を残す。 */
html body #hud.cover-guidance:not(.arioka) #battle-notices:not(.choosing) #objectives:not(.expand) { display:none !important; visibility:hidden !important; }
/* 退く途中は攻撃の手ほどきを畳み、到着したら元の段へ戻す。 */
html body #hud.safety-travel #tutorial { display:none !important; }
/* 操作文も任務文も隠れた札は、空の下地ごと畳む。 */
html body #hud.compact-battle #battle-notices #objectives.has-action:not(.keep-combat-task):not(.expand):has(.battle-action[hidden]) { display:block !important; }

/* 接敵中は読む必要のある指図と危険を残し、周辺の大きな下地を畳む。 */
html body #hud.combat-focus:not(.army-peek) :is(#armybar,.tl .plaque) { visibility:hidden; }
html body #hud.combat-focus #compass { background:linear-gradient(90deg,transparent,rgba(20,18,15,.45),transparent); }
html body #hud.combat-focus:not(.hc) .bl #h-hp.hp {
  padding:6px 8px; background:#14120f; box-shadow:0 0 0 2px #14120f;
}
html body #hud.combat-focus .bl #h-hp.hp i { height:22px !important; border-width:2px; }
html body #hud.combat-focus:not(.hc) #battle-notices #objectives:not(.expand) {
  padding:6px 8px !important; box-shadow:none !important;
}
html body #hud:is(.single-guide,.compact-battle) #battle-notices #objectives:not(.expand) :is(li.cur,.obj-text,.obj-now,.battle-action) {
  font-size:max(24px, calc(24px * var(--text-scale, 1))) !important; line-height:1.4 !important;
}
/* 短い行動札は文字の幅に収め、携帯の戦場を広く残す。 */
html body #hud.single-guide #battle-notices:not(.choosing) > #objectives:not(.expand) {
  width:fit-content !important; min-width:44px !important; min-height:44px !important;
  max-width:min(320px, 36vw) !important; align-self:flex-start;
}
html body #hud.single-guide #battle-notices #objectives:not(.expand) li.cur::before { display:none !important; }
html body #hud.single-guide #battle-notices #objectives.travel-retreat.ground-order:not(.expand) {
  background:#14120f !important; box-shadow:0 0 0 2px #14120f !important;
  max-width:min(272px, 40vw) !important;
}
html body #hud.single-guide #battle-notices #objectives.travel-retreat.ground-order:not(.expand) #obj-list li.cur .obj-now {
  font-size:max(24px, calc(24px * var(--text-scale, 1))) !important;
  white-space:normal !important; overflow-wrap:anywhere !important;
}
html body #hud.combat-focus #markers .mk.main.flag-goal:not(.edge) b {
  font-size:max(18px, calc(20px * var(--text-scale, 1))) !important; white-space:normal;
}


#hud .guard-caption { display:inline-flex; align-items:center; justify-content:center; gap:8px; }
#hud .guard-sign { display:inline-block; position:relative; flex:none; width:26px; height:32px; background:#fff3ba; clip-path:polygon(0 0,100% 0,100% 60%,50% 100%,0 60%); }
#hud .guard-sign::after { content:''; position:absolute; left:6px; right:6px; top:8px; height:17px; background:linear-gradient(#14120f,#14120f) center/4px 100% no-repeat,linear-gradient(#14120f,#14120f) center 5px/100% 4px no-repeat; }
/* 説明と指・動作の絵を、実際に押せる一枚の枠へ収める。 */
#hud #wait-guard { position:absolute; right:calc(16px + env(safe-area-inset-right, 0px)); top:calc(96px + env(safe-area-inset-top, 0px)); width:156px; height:auto; min-height:80px; box-sizing:border-box; padding:8px; border:5px solid #fff3ba; border-radius:12px; background:rgba(20,18,15,.85); color:#fff3ba; box-shadow:0 0 0 3px #14120f; display:flex; flex-wrap:wrap; column-gap:12px; align-items:center; justify-content:center; font:800 16px/1.4 var(--ui); white-space:pre-line; pointer-events:auto; touch-action:none; user-select:none; cursor:pointer; }
#hud #wait-guard svg { width:44px; height:56px; flex:none; pointer-events:none; }
#hud #wait-guard svg:first-child { position:relative; z-index:1; margin-right:-48px; transform:translate(8px, 7px) scale(.72); }
/* 手と文字を実際に長押しする枠に収め、押す位置を一致させる。 */
html.touch #hud #wait-guard { top:auto; bottom:calc(128px + env(safe-area-inset-bottom, 0px)); display:grid; grid-template-columns:40px minmax(0, 1fr) 28px; width:264px; max-width:calc(100vw - 32px); min-height:80px; border-width:4px; border-radius:16px; column-gap:8px; row-gap:4px; background:#373326; box-shadow:0 0 0 3px #14120f, inset 0 -6px 0 #14120f; }
html.touch #hud #wait-guard svg:first-child { display:block; grid-column:1; grid-row:1 / 3; width:40px; height:52px; margin:0; transform:none; }
html.touch #hud #wait-guard svg + svg { display:block; grid-column:3; grid-row:1 / 3; width:28px; height:36px; }
#hud #wait-guard .release-sign { display:none; }
#hud #wait-guard.release-ready .release-sign { display:block; }
#hud #wait-guard.release-ready .shield-sign { display:none; }
#hud #wait-guard.release-ready { border-style:double; border-width:6px; background:#14120f; }
#hud #wait-guard.release-ready .swipe-hand { transform:translateY(-10px); }
html.touch #hud #wait-guard span { grid-column:2; width:auto; font-size:max(18px,calc(18px * var(--text-scale,1))); white-space:pre-line; word-break:keep-all; overflow-wrap:normal; }
html.touch #hud #wait-guard small { grid-column:2; width:auto; white-space:normal; word-break:keep-all; overflow-wrap:normal; font-size:max(15px,calc(15px * var(--text-scale,1))); }
#hud #wait-guard span { position:static; width:100%; padding:0; pointer-events:none; }
#hud #wait-guard small { position:static; width:100%; padding:0; font:700 max(18px,calc(18px * var(--text-scale,1)))/1.4 var(--ui); pointer-events:none; }
html.tc-sw #hud #wait-guard :is(span,small) { right:auto; left:0; }
#hud #wait-guard small:empty { display:none; }
#hud #wait-guard.guard-now { border-color:#fff; background:#49372a; box-shadow:0 0 0 3px #14120f,0 0 0 6px #fff3ba; }
#hud #wait-guard .hold-progress { stroke-dasharray:113.1; stroke-dashoffset:calc(113.1 * (1 - var(--hold-progress, 0))); transform:rotate(-90deg); transform-origin:0 -12px; }
#hud #wait-guard .guard-meter { display:none; grid-column:1 / -1; grid-row:3; height:4px; border:2px solid #fff; background:#14120f; overflow:hidden; pointer-events:none; }
#hud #wait-guard[aria-pressed="true"] .guard-meter { display:block; }
#hud #wait-guard .guard-meter b { display:block; height:100%; background:#fff3ba; transform:scaleX(var(--hold-progress,0)); transform-origin:left; }
html body #hud.retreat-priority :is(#crosshair,#staring,.stamina-cue,.combat-cue-label) { visibility:hidden !important; }
html body #hud.retreat-priority #objectives:not(.expand) .obj-now { font-size:max(28px, calc(28px * var(--text-scale, 1))) !important; font-weight:900; }
#hud #wait-guard[aria-pressed="true"] { box-shadow:0 0 0 3px #14120f, inset 0 3px 0 #14120f; background:#373326; }
html body #hud #wait-guard[aria-pressed="true"] { border-style:double; border-width:6px; border-color:#fff; }
html.touch #hud #wait-guard:active { box-shadow:0 0 0 3px #14120f, inset 0 4px 0 #14120f; background:#493f2c; }
#hud #wait-guard:focus-visible { outline:3px solid #fff3ba; outline-offset:5px; }
html.touch body #hud.wait-guard-active #objectives:not(.expand):not(.keep-guard-task),
html body #hud.dodge-active #battle-notices #objectives:not(.expand) { display:none !important; }
/* 守る釦がある間は、別の手ほどきや中央の操作絵を重ねない。 */
html.touch body #hud.wait-guard-active :is(#tutorial,#skiphint,.combat-cue-label) { display:none !important; }
/* なぞる間は操作を一か所に集め、上の指示と行き先の印を重ねない。 */
html body #hud:is(.touch-turn-coach,.dodge-turn-coach) #battle-notices:not(.choosing) { visibility:hidden !important; pointer-events:none !important; }
#hud .escape-gesture .swipe-hand { animation: practiceSwipe 1.6s ease-in-out infinite; }
@keyframes practiceSwipe { 0%,15% { transform:translate(0,0); } 70%,100% { transform:translate(var(--swipe-shift,64px),var(--swipe-rise,0px)); } }
body.rm #hud .escape-gesture .swipe-hand { animation:none; }
@media(prefers-reduced-motion:reduce) { #hud .escape-gesture .swipe-hand { animation:none; } }

html body #hud.touch-turn-coach #markers { visibility:hidden !important; }
/* 構えは押している釦で示す。中央の盾と気力の輪を重ねて兵を隠さない。 */
html body #hud.wait-guard-active #crosshair.guard:not(.hit) { visibility:hidden !important; }
html body #hud.wait-guard-active #staring {
 left:calc(100% - 202px - env(safe-area-inset-right, 0px)) !important;
 top:calc(100% - 158px - env(safe-area-inset-bottom, 0px)) !important;
}
html body #hud.wait-guard-active .stamina-cue {
 left:calc(100% - 202px - env(safe-area-inset-right, 0px)) !important;
 top:calc(100% - 120px - env(safe-area-inset-bottom, 0px)) !important;
}
/* 押せない待機札は角形一枚。構える操作は元の操作欄に残す。 */
html.touch body #hud #wait-guard.wait-status:disabled:not([hidden]) {
 display:block; min-height:0; width:auto; padding:8px 14px; border:0;
 border-left:4px solid #fff; border-radius:0; background:#14120f;
 box-shadow:none; pointer-events:none; cursor:default; opacity:1;
}
html.touch body #hud #wait-guard.wait-status:disabled:not([hidden]) svg { display:none; }
html.touch body #hud #wait-guard.wait-status:disabled:not([hidden]) span { font-size:max(18px,calc(18px * var(--text-scale,1))); }
#hud #wait-guard[hidden] { display:none; }
/* 決まった待ち時間だけ、残り秒数と実際の進みに合う輪を任務の中へ。 */
html body #hud #objectives.timed-wait:not(.expand) li.cur .obj-now::before {
 content:''; display:inline-block; width:28px; height:28px; margin-right:8px;
 border:0; border-radius:50%; vertical-align:middle;
 background:conic-gradient(#fff3ba var(--wait-progress, 0%), #655f50 0);
 mask:radial-gradient(transparent 48%, #000 52%);
}

html.tc-sw #hud #wait-guard { right:auto; left:calc(16px + env(safe-area-inset-left, 0px)); }
html body #hud.shitaragahara.pursuit-order.pursuit-order #battle-notices:not(.choosing) #objectives:not(.expand):not(.ground-order) {
 position:fixed !important; left:50% !important; top:16px !important; right:auto !important; bottom:auto !important;
 transform:translateX(-50%) !important; width:max-content !important; max-width:36vw !important;
}
/* 追撃の札は道の先端の旗と一組にし、携帯でも読める字を保つ。 */
html body #hud.shitaragahara.pursuit-order #battle-notices:not(.choosing) #objectives.ground-order:not(.expand) {
 position:fixed !important; inset:auto !important;
 left:var(--ground-order-x) !important; top:var(--ground-order-y) !important;
 transform:none !important; width:max-content !important; max-width:min(280px,36vw) !important;
}
html body #hud.shitaragahara.pursuit-order #battle-notices #objectives.ground-order:not(.expand) li.cur :is(.obj-now,.obj-text) {
 font-size:max(24px,calc(24px * var(--text-scale,1))) !important;
}
/* 設楽原の携帯横画面では、寄せ手を隠さず親指の届く下端で構える。 */
@media (max-height:500px) {
 html.touch body #hud.shitaragahara #wait-guard {
  top:auto; left:auto; right:calc(16px + env(safe-area-inset-right, 0px)); bottom:calc(16px + env(safe-area-inset-bottom, 0px)); width:240px; height:auto; min-height:72px;
  grid-template-rows:auto auto; align-content:center;
  grid-template-columns:40px minmax(0, 1fr); column-gap:8px; row-gap:2px; padding:6px; border-width:4px; border-radius:14px;
 }
 html.touch body #hud.shitaragahara #wait-guard svg:first-child { width:40px; height:52px; }
`;
export const noticeStyle4 = ` html.touch body #hud.shitaragahara #wait-guard svg + svg { display:none; }
 html.touch body #hud.shitaragahara #wait-guard span { font-size:max(18px,calc(18px * var(--text-scale,1))); }
 html.touch body #hud.shitaragahara #wait-guard small { font-size:max(13px,calc(13px * var(--text-scale,1))); }
 html.touch.tc-sw body #hud.shitaragahara #wait-guard { right:auto; left:calc(16px + env(safe-area-inset-left, 0px)); }
}
html body #hud #wait-guard.guard-travel { opacity:1; border:0; box-shadow:none; background:#14120f; cursor:default; }
html body #hud #wait-guard.guard-travel svg { visibility:hidden; }
html.touch body #hud #wait-guard.guard-travel.wait-status:disabled:not([hidden]) { padding-left:48px; }
html body #hud #wait-guard.guard-travel::before { content:'◎'; position:absolute; left:12px; top:50%; transform:translateY(-50%); font-size:28px; color:#fff; }
/* 合戦共通の長押し札は端へ固定し、手の絵と操作を一枚で示す。 */
@media (max-height:500px) {
 html.touch body #hud.single-guide #wait-guard {
  top:auto; left:auto; right:calc(16px + env(safe-area-inset-right, 0px));
  bottom:calc(16px + env(safe-area-inset-bottom, 0px));
  width:max-content; max-width:calc(100vw - 32px); min-height:48px; height:max-content; padding:6px 10px; border-width:3px;
  box-shadow:0 0 0 3px #14120f, inset 0 -6px 0 #14120f;
  grid-template-columns:24px minmax(0,1fr); grid-template-rows:auto auto;
  align-content:center; column-gap:8px; row-gap:0;
 }
 html.touch body #hud.single-guide #wait-guard svg:first-child { width:24px; height:32px; }
 html.touch body #hud.single-guide #wait-guard svg + svg { display:none; }
 html.touch body #hud.single-guide #wait-guard span { font-size:max(18px,calc(18px * var(--text-scale,1))); }
 html.touch body #hud.single-guide #wait-guard small { font-size:max(13px,calc(13px * var(--text-scale,1))); }
 html.touch body #hud.single-guide #wait-guard[aria-pressed="true"] {
  border:3px double #fff; border-radius:12px;
  box-shadow:0 0 0 3px #14120f, inset 0 6px 0 #14120f;
 }
 html.touch.tc-sw body #hud.single-guide #wait-guard { right:auto; left:calc(16px + env(safe-area-inset-left, 0px)); }
 html.touch body #hud.single-guide #battle-notices #objectives:not(.expand) #obj-list li.cur .obj-now {
  font-size:max(24px,calc(24px * var(--text-scale,1))) !important; line-height:1.4 !important;
 }
}
/* 岩村の柵と切岸は中央を空け、守る釦を親指の届く端へ固定する。 */
html.touch body #hud.iwamura #wait-guard {
 left:auto !important; right:calc(16px + env(safe-area-inset-right, 0px)) !important;
 top:auto !important; bottom:calc(24px + env(safe-area-inset-bottom, 0px));
 width:208px; min-height:64px; padding:6px; border-width:2px; border-radius:8px;
 grid-template-columns:24px minmax(0, 1fr); column-gap:8px; row-gap:2px;
}
html.tc-sw.touch body #hud.iwamura #wait-guard {
 left:calc(16px + env(safe-area-inset-left, 0px)) !important; right:auto !important;
 bottom:calc(154px + env(safe-area-inset-bottom, 0px)); /* 左下の命と傷の札も空ける。 */
}
html.touch body #hud.iwamura #wait-guard svg:first-child { width:24px; height:36px; }
html.touch body #hud.iwamura #wait-guard svg + svg { display:none; }
html.touch body #hud.iwamura #wait-guard span { font-size:max(16px,calc(16px * var(--text-scale,1))); }
html.touch body #hud.iwamura #wait-guard small { font-size:max(13px,calc(13px * var(--text-scale,1))); }
html body:has(#wait-guard:not([hidden]):not(:disabled)) #tc [data-b="grd"] { visibility:hidden; }
/* 守備の操作は親指の届く端に固定し、指の印と押す枠を一つにする。 */
html.touch body #hud #wait-guard.ground-hold:not([hidden]) {
 left:auto !important; top:auto !important;
 right:calc(16px + env(safe-area-inset-right, 0px)) !important;
 bottom:calc(16px + env(safe-area-inset-bottom, 0px)) !important; width:196px; min-height:64px; height:auto;
 display:grid; grid-template-columns:28px minmax(0,1fr); grid-template-rows:auto auto;
 padding:6px; gap:2px 8px; border-width:3px; border-radius:10px;
}
html.touch.tc-sw body #hud #wait-guard.ground-hold:not([hidden]) { right:auto !important; left:calc(16px + env(safe-area-inset-left, 0px)) !important; }
html.touch body #hud #wait-guard.ground-hold svg:first-child { display:block; width:28px; height:40px; margin:0; transform:none; }
html.touch body #hud #wait-guard.ground-hold svg + svg { display:none; }
html.touch body #hud #wait-guard.ground-hold span { font-size:max(18px,calc(18px * var(--text-scale,1))); }
html.touch body #hud #wait-guard.ground-hold small { font-size:max(13px,calc(13px * var(--text-scale,1))); }
/* 防御中も敵の体を透かして見る。頭上と照準の印は小さな中空の形へそろえる。 */
#hud #crosshair.guard:not(.hit)::after { inset:3px 4px 1px; border:2px solid #eee6ce; border-radius:3px 3px 8px 8px; background:none; clip-path:none; filter:none; box-shadow:0 0 0 1px #14120f; }
/* 防ぐ札は欄の高さ制限で切らず、実寸を測って画面内へ収める。 */
html body #hud.guard-button-help #battle-notices:not(.choosing):not(:has(#objectives.expand)) {
 max-height:none !important; overflow:visible !important;
}
html body #hud.guard-button-help #battle-notices #objectives:not(.expand):not(.keep-guard-task):has(.guard-action-button) {
 position:fixed !important; inset:auto !important; left:var(--guard-order-x, 96px) !important; top:var(--guard-order-y, 80px) !important;
 width:max-content !important; max-width:calc(100vw - 24px) !important; min-height:0 !important; padding:0 !important;
 background:none !important; border:0 !important; box-shadow:none !important; overflow:visible !important;
}
html body #hud.guard-button-help #objectives:not(.expand):not(.keep-guard-task):has(.guard-action-button) > :not(.battle-action) { display:none !important; }
#hud.guard-button-help .battle-action { margin:0; padding:0; }
html body #hud.combat-instruction #battle-notices #objectives:not(.expand) {
 position:fixed !important; inset:auto !important; left:auto !important; right:calc(88px + env(safe-area-inset-right, 0px)) !important; top:16px !important;
 width:max-content !important; max-width:min(300px, calc(100vw - 120px)) !important; max-height:none !important; overflow:visible !important;
}
html body #hud.combat-instruction #objectives:not(.keep-combat-task):not(.keep-guard-task):not(.expand) > :not(.battle-action),
html body #hud.combat-instruction #markers,
#hud.combat-instruction .battle-action.guard-action::before { display:none !important; }
/* 接敵時は任務の長文を畳み、今必要な操作一つだけを大きく読む。 */
html body #hud #battle-notices #objectives.immediate-action.has-action:not(.expand) > :not(.battle-action) { display:none !important; }
html body #hud #battle-notices #objectives.immediate-action.has-action:not(.expand) .battle-action:not([hidden]) {
 display:block !important; font-size:max(24px,calc(24px * var(--text-scale,1))) !important; line-height:1.4;
}
html.touch body #hud.honnoji #battle-notices #objectives.ground-order:not(.expand) li.cur .obj-now {
 font-size:max(24px,calc(24px * var(--text-scale,1))) !important; line-height:1.4 !important;
}
/* 本能寺の奥へ退く期限も札の幅で折り返す。パソコンで右端へ字だけはみ出させない。 */
html body #hud.honnoji #battle-notices #objectives.ground-order:not(.expand) li.cur .obj-now {
 white-space:normal !important; overflow-wrap:anywhere !important; min-width:0 !important;
}

#hud.melee-guide #crosshair { visibility:hidden; }
/* 気力の輪は頭上の盾から離す。照準は狙いの位置を保つ。 */
#hud.guard-guide #staring { left:calc(50% - 100px); top:calc(50% + 64px); }
#hud.guard-guide .stamina-cue { left:calc(50% - 108px) !important; top:calc(50% + 88px) !important; }
/* 反撃は一行で読み、指の印は実際の攻撃ボタンへ置く。 */
html.touch.tc-low body #hud #battle-notices #objectives.attack-help:not(.expand) {
 width:max-content !important; max-width:calc(100vw - 112px) !important; min-height:44px !important;
}
html.touch body #hud .battle-action.attack-action {
 font-size:max(18px, calc(18px * var(--text-scale, 1))) !important; white-space:nowrap; overflow-wrap:normal;
}

/* 箕作の携帯横向きは小地図の左へ収め、人数の条件まで札の中で折り返す。 */
@media (max-height:500px) {
  html.touch body #hud.mitsukuri #battle-notices:not(.choosing),
  html.touch body #hud.mitsukuri.mission-visible #battle-notices:not(.choosing):not(:has(#objectives.expand)) {
    left:auto !important; right:calc(104px + env(safe-area-inset-right, 0px)) !important;
    top:calc(16px + env(safe-area-inset-top, 0px)) !important;
    width:min(300px, 34vw) !important; min-width:0 !important;
    max-height:33vh !important; box-sizing:border-box;
  }
  html.touch body #hud.mitsukuri #battle-notices:not(.choosing) > :is(#objectives,#battle-message),
  html.touch body #hud.mitsukuri #battle-notices:not(.choosing) #objectives.ground-order:not(.expand) {
    position:relative !important; inset:auto !important; transform:none !important;
    width:100% !important; min-width:0 !important; max-width:100% !important; box-sizing:border-box;
  }
  html.touch body #hud.mitsukuri #battle-notices:not(.choosing) #objectives:not(.expand) :is(li.cur,.obj-text,.obj-now,.battle-action) {
    min-width:0 !important; max-width:100% !important; width:auto !important;
    white-space:normal !important; overflow-wrap:anywhere !important; word-break:normal !important;
    height:auto !important; max-height:none !important; overflow:visible !important;
    font-size:max(16px, calc(16px * var(--text-scale, 1))) !important; line-height:1.4 !important;
  }
}

/* 畳んだ任務は本文一列。隠した状態欄や幅ゼロの伸縮欄へ本文を押し込まない。 */
html body #hud :is(#battle-notices,#choice-tasks) #objectives:not(.expand) li.cur {
  display:block !important; grid-template-columns:minmax(0, 1fr); min-width:0;
  margin:0; padding:0; background:none; box-shadow:none; text-align:left;
}
html body #hud :is(#battle-notices,#choice-tasks) #objectives:not(.expand) li.cur::before { display:none !important; }
html body #hud :is(#battle-notices,#choice-tasks) #objectives:not(.expand) li.cur .obj-text {
  display:block; grid-column:1 / -1; width:auto; min-width:0; flex:1 1 auto !important;
}
html body #hud :is(#battle-notices,#choice-tasks) #objectives:not(.expand) li.cur .obj-now {
  display:block; writing-mode:horizontal-tb; white-space:normal; overflow-wrap:break-word;
}
/* 常設の札は墨の端を抜いた帯へ。文字は濃い部分に収め、末尾の余白だけ透かす。 */
html body #hud:not(.guard-guide):not(.flag-guide):not(.person-guide) #battle-notices:not(.choosing) #objectives:not(.expand):not(.ground-order) {
  width:fit-content !important; max-width:100% !important; min-height:44px;
  align-self:flex-start; padding:6px 28px 6px 10px !important;
  background:linear-gradient(90deg,rgba(20,18,15,.9),rgba(20,18,15,.84) calc(100% - 24px),transparent) !important;
  border:0; border-left:1px solid #b8a273; border-radius:0; box-shadow:none !important;
}
html body #hud:is(.single-guide,.compact-battle) #battle-notices #objectives:not(.expand):not(.keep-combat-task) :is(li.cur,.obj-text,.obj-now) {
  font-size:max(18px, calc(18px * var(--text-scale, 1))) !important; line-height:1.45 !important;
}
/* 詳しい年月日は開戦前へ移し、戦の中は今することに場所を空ける。 */
html body #hud.single-guide #dateline { display:none !important; }

`;
export const noticeStyle5 = `
html body #hud #battle-notices:not(.choosing) #objectives:not(.expand):not(.travel-retreat) {
  width:fit-content !important; max-width:100% !important; min-width:44px !important;
  align-self:flex-start; box-sizing:border-box;
}
html body #hud #battle-notices:not(.choosing) #objectives:not(.expand) #obj-list li.cur {
  display:block !important; width:auto !important; min-width:0 !important;
  height:auto !important; max-height:none !important; box-sizing:border-box;
}
html body #hud #battle-notices:not(.choosing) #objectives:not(.expand) li.cur :is(.obj-text,.obj-now) {
  display:block; width:auto !important; min-width:0 !important; max-width:100% !important;
  position:static !important; inset:auto !important; transform:none !important;
  float:none !important; writing-mode:horizontal-tb !important;
  white-space:normal !important; overflow-wrap:anywhere; word-break:normal;
  font-size:max(18px, calc(18px * var(--text-scale, 1))) !important; line-height:1.4 !important;
}
html body #hud #battle-notices:not(.choosing) #objectives:not(.expand) li.cur small {
  width:auto !important; min-width:0; max-width:100%; box-sizing:border-box;
}
/* 墨の抜けは末尾の二十四画素だけ。長文も折り返し、文字の下地の濃さは保つ。 */
html body #hud:not(.hc):not(:is(.guard-guide,.flag-guide,.person-guide)) #battle-notices:not(.choosing) #objectives:not(.expand) {
  background:linear-gradient(90deg,rgba(20,18,15,.9),rgba(20,18,15,.84) calc(100% - 24px),transparent) !important;
  box-shadow:none !important; border:0; border-inline-start:1px solid var(--kin); border-radius:0;
  padding:6px 28px 6px 10px !important;
  /* 後段の行ごとの下地と併用し、透けた所でも字の輪郭を保つ。 */
  text-shadow:-1px -1px #080706, 1px -1px #080706, -1px 1px #080706, 1px 1px #080706, 0 2px #080706 !important;
}
/* 本文側の影なし指定にも同じ縁を渡し、補足と操作の字も明るい空に埋もれさせない。 */
html body #hud:not(.hc):not(:is(.guard-guide,.flag-guide,.person-guide)) #battle-notices:not(.choosing) #objectives:not(.expand) * {
  text-shadow:inherit !important;
}
`;
