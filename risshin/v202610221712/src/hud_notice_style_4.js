export const noticeStyle14 = `
/* 退く案内は既存の一枚を端へ置く。押せる高さは残す。 */
html body #hud #battle-notices:not(.choosing) #objectives.travel-retreat.ground-order.destination-sign.compact-steps:not(.expand) {
 width:max-content !important; max-width:calc(100vw - 24px) !important;
 min-height:44px !important; padding:6px 10px !important;
}
html body #hud #battle-notices:not(.choosing) #objectives.travel-retreat.ground-order.destination-sign.compact-steps:not(.expand) #obj-list li.cur .obj-now {
 font-size:max(20px,calc(20px * var(--text-scale,1))) !important;
 line-height:1.4 !important; white-space:nowrap !important;
}
#hud .step-count { display:inline !important; white-space:nowrap !important; }
html body #hud #battle-notices:not(.choosing) #objectives.compact-steps:not(.expand) .obj-now {
 white-space:nowrap !important;
}
html:root.touch body #hud.single-guide #battle-notices:not(.choosing):has(#objectives.facing-order:not(.expand)) {
 transform:none !important; overflow:visible !important;
}
html:root.touch body #hud #battle-notices:not(.choosing) #objectives#objectives.facing-order:not(.expand) {
 position:fixed !important; inset:auto !important; transform:none !important;
 left:var(--facing-order-x) !important; top:var(--facing-order-y) !important;
 width:max-content !important; max-width:calc(100vw / 3 - 24px) !important;
 min-height:44px !important; max-height:none !important;
 padding:6px 8px !important; box-sizing:border-box;
 border:0 !important; border-radius:6px; background:#14120f !important;
}
html:root.touch body #hud #battle-notices:not(.choosing) #objectives#objectives.facing-order:not(.expand),
html:root.touch body #hud #battle-notices:not(.choosing) #objectives#objectives.facing-order:not(.expand) * { pointer-events:none !important; }
html:root.touch body #hud #battle-notices:not(.choosing) #objectives#objectives.facing-order.facing-left:not(.expand) {
 left:var(--facing-order-x) !important;
}
html:root.touch body #hud #battle-notices:not(.choosing) #objectives#objectives.facing-order:not(.expand) .goal-place {
 display:none !important;
}
html:root.touch body #hud #battle-notices:not(.choosing) #objectives#objectives.facing-order:not(.expand) .obj-now {
 font-size:max(24px,calc(24px * var(--text-scale,1))) !important; line-height:1.4 !important;
 white-space:nowrap !important; overflow-wrap:normal !important;
}
html:root.touch body #hud #objectives.facing-order .facing-hand { display:block; width:160px; height:84px; margin:4px auto 0; }
/* 守る旗への帰還は短い下知を大きくし、既存の任務一枚で伝える。 */
html:root.touch body #hud #battle-notices:not(.choosing) #objectives#objectives.defend-return:not(.expand) #obj-list li.cur .obj-now {
 font-size:max(24px,calc(24px * var(--text-scale,1))) !important; line-height:1.4 !important;
}
/* 操作の札は丸と一本の矢印のそばへ。重なる指の絵と同じ操作文を消す。 */
html:root body #hud #battle-notices:not(.choosing):has(#objectives.swipe-order:not(.expand)) { transform:none !important; overflow:visible !important; }
html:root body #hud #battle-notices:not(.choosing) #objectives#objectives.swipe-order:not(.expand) {
 position:fixed !important; inset:auto !important; transform:none !important;
 left:var(--swipe-order-x) !important; top:var(--swipe-order-y) !important;
 width:max-content !important; max-width:224px !important; min-height:44px !important;
 padding:4px 8px !important; background:#14120f !important;
}
html:root body #hud #battle-notices #objectives#objectives:is(.swipe-order,.facing-order):not(.expand) #obj-list,
html:root body #hud #battle-notices #objectives#objectives:is(.swipe-order,.facing-order):not(.expand) li.cur .obj-text {
 display:block !important;
}
html:root body #hud #battle-notices #objectives#objectives:is(.swipe-order,.facing-order):not(.expand) :is(.battle-action,.obj-full,.goal-place,.swipe-instruction svg) { display:none !important; }
html:root body #hud #battle-notices #objectives#objectives:is(.swipe-order,.facing-order):not(.expand) .swipe-instruction {
 display:block !important; font-size:16px !important; line-height:1.4 !important;
}
html:root body #hud #battle-notices #objectives#objectives.swipe-order.travel-retreat:not(.expand) li.cur .obj-now {
 font-size:max(24px,calc(24px * var(--text-scale,1))) !important;
 line-height:1.4 !important; white-space:nowrap !important;
}
/* 敵のそばの札は移動だけで追従させ、毎コマ配置を計算し直さない。 */
html:root body #hud #battle-notices:not(.choosing) #objectives.approach-order.has-action:not(.expand) {
 position:fixed !important; inset:auto !important;
 left:0 !important; top:0 !important;
 transform:var(--enemy-order-move,translate(16px,80px)) !important;
 width:max-content !important; min-width:44px !important; max-width:min(240px,32vw) !important;
 height:auto !important; min-height:44px !important; max-height:none !important;
 padding:6px 10px !important; margin:0 !important; box-sizing:border-box;
 background:#14120f !important;
}
html:root body #hud #battle-notices #objectives.approach-order.has-action:not(.expand) > :not(.battle-action) { display:none !important; }
html:root body #hud #battle-notices:not(.choosing) #objectives.approach-order.has-action:not(.expand) #obj-list {
 display:none !important;
}
html:root body #hud #battle-notices #objectives.approach-order.has-action:not(.expand) .battle-action:not([hidden]) {
 width:auto !important; height:auto !important; min-height:0 !important;
 margin:0 !important; padding:0 !important; font-size:max(20px,calc(20px * var(--text-scale,1))) !important;
 line-height:1.4 !important;
}
`;
export const noticeStyle15 = `
/* 鳥取は操作中も岸・柵の任務を同じ幅で読む。横一杯の黒帯を作らない。 */
@media (max-height:500px) {
 html body #hud.tottori.mission-visible #battle-notices:not(.choosing):not(:has(#objectives.expand)) {
  left:calc(50% - 150px) !important; right:auto !important;
  top:calc(16px + env(safe-area-inset-top,0px)) !important; bottom:auto !important;
  width:300px !important; max-width:calc(100vw - 176px) !important;
 }
 html body #hud.tottori #battle-notices:not(.choosing) > #objectives:not(.expand) {
  min-width:0 !important; max-width:100% !important;
 }
 html body #hud.tottori #battle-notices:not(.choosing) #objectives.has-action.keep-combat-task:not(.expand):has(.battle-action:not([hidden])) > #obj-list,
 html body #hud.tottori #battle-notices:not(.choosing) #objectives.has-action.keep-combat-task:not(.expand) #obj-list li.cur .obj-text {
  display:block !important;
 }
 html body #hud.tottori #battle-notices:not(.choosing) #objectives:not(.expand) :is(li.cur,.obj-text,.obj-now,.battle-action) {
  width:auto !important; min-width:0 !important; max-width:100% !important;
  box-sizing:border-box; white-space:normal !important; overflow-wrap:anywhere;
 }
 html body #hud.tottori #battle-notices:not(.choosing) #objectives:not(.expand) li.cur > small {
  font-size:max(13px,calc(13px * var(--text-scale,1))) !important; line-height:1.4 !important;
 }
}
`;
export const noticeStyle16 = `
/* 守る操作は押せる札へ集め、同じ案内を任務欄へ重ねない。 */
html.touch body #hud.wait-guard-active #battle-notices:not(.choosing) #objectives:not(.expand):not(.keep-guard-task) {
 display:none !important;
}
/* 一行の任務に空の高さを残さず、字と押せる高さを保つ。 */
html body #hud #battle-notices:not(.choosing) #objectives:not(.expand) {
 height:auto !important; min-height:44px !important; padding:6px 10px !important;
}
html body #hud #battle-notices:not(.choosing) #objectives:not(.expand) #obj-list {
 height:auto !important; min-height:44px !important; min-width:44px; box-sizing:border-box; margin:0 !important; padding:0 !important;
}
html body #hud #battle-notices:not(.choosing) #objectives:not(.expand) li.cur {
 height:auto !important; min-height:0 !important; margin:0 !important; padding:0 !important;
}
@media (max-height:500px) {
 html body #hud.single-guide #battle-notices:not(.choosing) #objectives:not(.expand):not(.travel-retreat) {
  width:fit-content !important; max-width:100% !important;
 }
 html body #hud.single-guide #battle-notices:not(.choosing) #objectives:not(.expand) :is(.obj-now,.battle-action:not([hidden])) {
  font-size:max(20px,calc(20px * var(--text-scale,1))) !important;
 }
 html.touch body #hud.single-guide #wait-guard {
  width:264px; min-height:56px; grid-template-rows:auto;
 }
 html.touch body #hud.single-guide #wait-guard span { font-size:max(18px,calc(18px * var(--text-scale,1))); }
}
`;
export const noticeStyle17 = `
/* 待つ札は人物の足元から離し、既存の任務一枚を上の端へ戻す。 */
html body #hud.quiet-wait #battle-notices:not(.choosing) #objectives#objectives:not(.expand) {
 position:fixed !important; left:calc(76px + env(safe-area-inset-left,0px)) !important;
 top:calc(64px + env(safe-area-inset-top,0px)) !important; right:auto !important; bottom:auto !important;
 width:max-content !important; max-width:min(280px,32vw) !important;
 transform:none !important; translate:none !important;
}

/* 守りから反撃へ移っても、携帯の行動案内は同じ親指側に保つ。 */
/* 攻撃できる時は押す釦へ案内を集め、同じ位置の任務札を畳む。 */
html.touch body #hud.attack-button-guide #battle-notices:not(.choosing) #objectives#objectives:not(.expand) { display:none !important; }
@media (max-height:500px) {
 html.touch body #hud #wait-guard#wait-guard {
  top:auto !important; bottom:calc(16px + env(safe-area-inset-bottom, 0px)) !important;
  width:280px; max-width:34vw; min-height:64px;
 }
 html.touch body #hud #wait-guard#wait-guard span { font-size:max(24px,calc(24px * var(--text-scale,1))); }
 html.touch body #hud.hand-action-guide #battle-notices:not(.choosing) #objectives#objectives:not(.expand) {
  position:fixed !important; left:auto !important; top:auto !important;
  right:calc(16px + env(safe-area-inset-right, 0px)) !important;
  bottom:calc(16px + env(safe-area-inset-bottom, 0px)) !important;
  transform:none !important; width:280px !important; max-width:34vw !important;
  min-height:64px !important; box-sizing:border-box; padding:8px !important;
  background:#14120f !important;
 }
 html.touch body #hud.hand-action-guide #battle-notices #objectives#objectives:not(.expand) :is(.obj-now,.battle-action:not([hidden])) {
  font-size:max(24px,calc(24px * var(--text-scale,1))) !important; line-height:1.4 !important;
  white-space:normal !important; overflow-wrap:anywhere !important; min-width:0 !important; max-width:100% !important;
 }
 html.touch.tc-sw body #hud.hand-action-guide #battle-notices:not(.choosing) #objectives#objectives:not(.expand) {
  right:auto !important; left:calc(16px + env(safe-area-inset-left, 0px)) !important;
 }
}
`;
export const noticeStyle18 = `
/* 押す札は親指側へ固定し、守る実物の印とは分ける。 */
html.touch body #hud #wait-guard#wait-guard.ground-hold:not([hidden]) {
 left:auto !important; top:auto !important;
 right:calc(16px + env(safe-area-inset-right, 0px)) !important;
 bottom:calc(16px + env(safe-area-inset-bottom, 0px)) !important;
 width:272px; max-width:calc(50vw - 32px); min-height:72px;
 background:#14120f; grid-template-columns:32px minmax(0,1fr);
}
html.touch body #hud #wait-guard#wait-guard.ground-hold span {
 font-size:max(18px,calc(18px * var(--text-scale,1)));
}
/* 行き先が見切れても短い札は上の同じ位置に保つ。 */
html:root body #hud.single-guide #battle-notices:not(.choosing) #objectives#objectives.route-summary:not(.ground-order):not(.facing-order):not(.enemy-order):not(.expand) {
 position:fixed !important; inset:auto !important; left:50% !important; top:16px !important;
 transform:translateX(-50%) !important; width:300px !important; max-width:calc(100vw - 32px) !important;
 min-height:44px !important; box-sizing:border-box; padding:6px 10px !important;
 background:#14120f !important;
}
html:root body #hud.single-guide #battle-notices #objectives#objectives.route-summary:not(.expand) #obj-list li.cur :is(.obj-text,.obj-now) {
 font-size:max(20px,calc(20px * var(--text-scale,1))) !important; line-height:1.4 !important;
}
html:root body #hud.single-guide #battle-notices #objectives#objectives.route-summary:not(.expand) :is(li.cur small,.destination-cue,.obj-tag) { display:none !important; }
/* 高遠の長い道案内を、両軍の札と方角の帯から離す。携帯の配置は保つ。 */
@media (min-height:621px) {
 html:root:not(.touch) body #hud.takato.single-guide #battle-notices:not(.choosing) #objectives#objectives.route-summary:not(.expand) {
  top:calc(104px + env(safe-area-inset-top, 0px)) !important;
 }
}
/* 設楽原の追撃札も、上端の両軍名と方角の帯の下へ置く。 */
@media (min-height:501px) {
 html:root:not(.touch) body #hud.shitaragahara.pursuit-order #battle-notices:not(.choosing) #objectives#objectives:not(.expand):not(.ground-order) {
  top:calc(104px + env(safe-area-inset-top, 0px)) !important;
 }
}
/* 道案内の印だけにならないよう、選ばれた任務一枚の本文を残す。 */
html:root body #hud.route-task #battle-notices #objectives#objectives.route-summary:not(.expand):not(.notice-muted),
html:root body #hud.route-task #battle-notices #objectives#objectives.route-summary:not(.expand):not(.notice-muted) :is(#obj-list,li.cur,.obj-now) {
 display:block !important; visibility:visible !important;
}
`;
export const noticeStyle19 = `
html.touch body #hud #wait-guard#wait-guard :is(span,small) {
 min-width:0; max-width:100%; white-space:normal; word-break:normal; overflow-wrap:anywhere;
}
html.touch body #hud #wait-guard#wait-guard small {
 font-size:max(16px,calc(16px * var(--text-scale,1))); line-height:1.4;
}
/* 操作の説明は一行にまとめ、守る力は同じ札の下段へ。 */
@media (max-height:500px) {
 html.touch body #hud #wait-guard#wait-guard:not([hidden]) {
  width:320px; max-width:calc(50vw - 32px); min-height:76px;
  grid-template-columns:40px minmax(0,1fr); column-gap:8px;
 }
 html.touch body #hud #wait-guard#wait-guard svg:first-child { width:40px; height:52px; }
 html.touch body #hud #wait-guard#wait-guard:not([hidden]) span {
  font-size:max(22px,calc(22px * var(--text-scale,1))); line-height:1.3;
 }
}
html.touch.tc-sw body #hud #wait-guard#wait-guard.ground-hold:not([hidden]) {
 left:calc(16px + env(safe-area-inset-left, 0px)) !important; right:auto !important;
}
/* 常設任務の墨は文字のある所だけ。後から置く道案内にも同じ作りを通す。
   押せる外枠と行間は透明にし、人数・距離・操作の案内は省略しない。
   強い対比の設定、選択中、開いた一覧、指の手本は従来の下地を保つ。 */
html:root body #hud:not(.hc):not(:is(.guard-guide,.flag-guide,.person-guide)) #battle-notices:not(.choosing) #objectives#objectives:not(.expand):not(.touch-retreat-coach):has(li.cur .obj-now) {
 background:none !important; box-shadow:none !important; border:0 !important;
 border-radius:0; min-height:44px !important;
 text-shadow:0 1px 2px #000;
}
html:root body #hud:not(.hc):not(:is(.guard-guide,.flag-guide,.person-guide)) #battle-notices:not(.choosing) #objectives#objectives:not(.expand):not(.touch-retreat-coach):has(li.cur .obj-now) li.cur .obj-now {
 display:inline-block !important; max-width:100%; box-sizing:border-box; padding:2px 5px; background:rgba(12,10,8,.88) !important;
 color:#fff3df; -webkit-box-decoration-break:clone; box-decoration-break:clone;
}
html:root body #hud:not(.hc):not(:is(.guard-guide,.flag-guide,.person-guide)) #battle-notices:not(.choosing) #objectives#objectives:not(.expand):not(.touch-retreat-coach):has(li.cur .obj-now) :is(li.cur > small,.battle-action,.victory-condition,li.note-fresh) {
 width:fit-content !important; max-width:100% !important; box-sizing:border-box;
 padding:2px 5px; background:rgba(12,10,8,.88) !important; color:#fff3df;
 -webkit-box-decoration-break:clone; box-decoration-break:clone;
}
`;
export const noticeStyle20 = `
/* 危険の予告時刻は保ち、兵の前の黒枠を端の短い合図へ替える。 */
html body #hud.quiet-combat-cues #threats .threat.edge {
 background:transparent !important; border:0 !important; padding:2px !important;
 font-size:22px !important; line-height:1; text-shadow:0 1px 2px #14120f,1px 0 2px #14120f,-1px 0 2px #14120f;
}
/* 読み終えた任務は押せる目標印へ畳み、必要な時に一覧を開く。 */
html:root body #hud.quiet-orders #battle-notices:not(.choosing) #objectives#objectives.order-settled:not(.expand) {
 width:44px !important; min-width:44px !important; height:44px !important; min-height:44px !important;
 max-width:44px !important; padding:0 !important; box-sizing:border-box;
 background:rgba(20,18,15,.82) !important;
}
html:root body #hud.quiet-orders #battle-notices:not(.choosing) #objectives#objectives.order-settled:not(.expand) > * { display:none !important; }
html:root body #hud.quiet-orders #battle-notices:not(.choosing) #objectives#objectives.order-settled:not(.expand)::after {
 content:'目標'; display:flex; align-items:center; justify-content:center; height:100%;
 color:#fff3ba; font-size:max(15px,calc(15px * var(--text-scale,1))); font-weight:700;
}
/* 旗への下知は短い一行にし、実旗と同じ切れ込みのある旗を添える。 */
html:root body #hud #battle-notices #objectives#objectives.flag-task:not(.expand) #obj-list li.cur .obj-now {
 white-space:nowrap !important; overflow-wrap:normal !important;
}
html:root body #hud #battle-notices #objectives#objectives.flag-task:not(.expand) #obj-list li.cur .obj-now::before {
 content:'' !important; display:inline-block !important; width:20px; height:28px; margin-right:8px;
 vertical-align:middle; background:#fff3ba; border:0; border-radius:0;
 clip-path:polygon(0 0,100% 0,75% 22%,100% 44%,12% 44%,12% 100%,0 100%);
}
/* 守る旗へ添えた札は、移動案内の配置より優先する。 */
html:root body #hud #battle-notices:not(.choosing) #objectives#objectives.flag-task.defense-order:not(.expand) {
 position:fixed !important; inset:auto !important; transform:none !important;
 left:var(--defense-order-x) !important; top:var(--defense-order-y) !important;
 width:max-content !important; max-width:calc(100vw - 24px) !important;
}
/* 命の数値と細い棒は残し、けがの知らせには従来の文字幅を使う。 */
html:root body #hud.quiet-orders .bl #h-hp.hp,
html:root body #hud.quiet-orders .bl #h-hp.hp.healthy { padding:4px 6px; gap:3px; }
html:root body #hud.quiet-orders .bl #h-hp.hp .hp-remaining { font-size:max(16px,calc(16px * var(--text-scale,1))) !important; }
html:root body #hud.quiet-orders .bl #h-hp.hp i { width:132px; height:7px !important; border-width:1px; padding:0; }
html:root body #hud.quiet-orders .bl #h-hp.hp i strong { inset:1px; }
`;
export const noticeStyle21 = `
html:root body #hud .bl #h-hp.hp.healthy {
 padding:3px 6px; gap:3px; background:rgba(20,18,15,.94);
 border-left:2px solid #c2a25a; box-shadow:none;
}
html:root body #hud .bl #h-hp.hp.healthy .hp-remaining {
 font-size:max(18px,calc(18px * var(--text-scale,1))) !important; line-height:1.3;
}
html:root body #hud .bl #h-hp.hp.healthy i {
 width:144px; height:7px !important; border:1px solid #e0d5bd; padding:0;
 background:rgba(20,18,15,.45);
}
html:root body #hud .bl #h-hp.hp.healthy i strong { inset:1px; background:#e0d5bd; }
/* 押す札は同じ端と余白に固定し、指の絵まで枠内に収める。 */
@media (max-height:500px) {
 html.touch body #hud.single-guide #wait-guard:not([hidden]):not(.wait-status) {
  top:auto !important; bottom:calc(16px + env(safe-area-inset-bottom, 0px)) !important;
  width:280px; max-width:calc(100vw / 3); min-height:56px;
  padding:8px 12px; border:3px solid #fff3ba; border-radius:12px;
  grid-template-columns:28px minmax(0,1fr); box-sizing:border-box;
 }
 html.touch body #hud.single-guide #wait-guard:not([hidden]) svg:first-child {
  width:28px; height:38px; margin:0; transform:none;
 }
}
/* 携帯横の命と傷は小さな一枚。数字と状態の下に残量を一本だけ置く。 */
@media (max-height:500px) {
 html:root body #hud.single-guide .bl #h-hp.hp {
  display:grid !important; grid-template-columns:max-content minmax(0,1fr) !important;
  width:max-content !important; min-width:0; max-width:min(260px,calc(100vw - 32px));
  gap:3px 8px; padding:4px 6px; border:0; border-left:2px solid #c2a25a; box-shadow:none;
 }
 html:root body #hud.single-guide .bl #h-hp.hp .hp-remaining {
  grid-column:1; grid-row:1; justify-self:start;
  font-size:max(18px,calc(18px * var(--text-scale,1))) !important; line-height:1.3;
 }
 html:root body #hud.single-guide .bl #h-hp.hp em {
  grid-column:1 / -1; grid-row:3; justify-self:start; min-width:0;
  font-size:max(16px,calc(16px * var(--text-scale,1))) !important; line-height:1.3;
  white-space:normal; word-break:normal; overflow-wrap:anywhere;
 }
 html:root body #hud.single-guide .bl #h-hp.hp i {
  grid-column:1 / -1; grid-row:2; width:100%; min-width:160px; height:10px !important;
 }
}
`;
export const noticeStyle22 = `
/* 携帯横は端の一枚へ。中央の三分の二に操作札を置かない。 */
@media (max-height:500px) {
 html.touch body #hud #wait-guard#wait-guard:not([hidden]):not(.wait-status) {
  top:auto !important; bottom:calc(16px + env(safe-area-inset-bottom, 0px)) !important;
  width:264px !important; max-width:calc(100vw / 3 - 24px) !important; min-height:88px !important;
  padding:8px !important; border:3px solid #fff3ba !important; border-radius:12px;
  background:#14120f !important; color:#fff3ba;
  box-shadow:0 0 0 2px #14120f, inset 0 -4px 0 #5c5033 !important;
  grid-template-columns:28px minmax(0,1fr) !important; column-gap:8px; row-gap:2px;
 }
 html.touch body #hud #wait-guard#wait-guard:not([hidden]) svg:first-child {
  width:28px !important; height:36px !important;
 }
 html.touch body #hud #wait-guard#wait-guard:not([hidden]) svg + svg { display:none; }
 html.touch body #hud #wait-guard#wait-guard:not([hidden]) span {
  font-size:max(22px,calc(22px * var(--text-scale,1))) !important; line-height:1.3;
 }
 html.touch body #hud #wait-guard#wait-guard:not([hidden]) small {
  font-size:max(16px,calc(16px * var(--text-scale,1))) !important; line-height:1.4;
 }
}
/* 棒の意味を同じ釦の中に添える。札は増やさない。 */
html.touch body #hud #wait-guard#wait-guard .guard-meter {
 display:grid; grid-template-columns:max-content minmax(0,1fr); align-items:center; gap:8px;
 grid-column:1 / -1; grid-row:3; height:auto; border:0; background:none; overflow:visible;
}
html.touch body #hud #wait-guard#wait-guard .guard-meter em {
 font:700 max(15px,calc(15px * var(--text-scale,1)))/1.4 var(--ui); color:#fff3ba;
}
html.touch body #hud #wait-guard#wait-guard .guard-meter b {
 height:8px; border:1px solid #fff3ba; box-sizing:border-box; transform:none;
 background:linear-gradient(to right,#fff3ba calc(var(--hold-progress,0) * 100%),#14120f 0);
}
/* 守っている間は指を盾に替え、大きい状態の字を同じ押す場所に出す。 */
html.touch body #hud #wait-guard#wait-guard.guarding:not([hidden]) svg:first-child { display:none; }
html.touch body #hud #wait-guard#wait-guard.guarding:not([hidden]) svg + svg {
 display:block; grid-column:1; grid-row:1; width:32px; height:40px;
}
html.touch body #hud #wait-guard#wait-guard.guarding:not([hidden]) span {
 font-size:max(26px,calc(26px * var(--text-scale,1))) !important;
}
html.touch body #hud #wait-guard#wait-guard small:empty { display:none; }
/* 下馬は押せる釦一つにまとめ、一覧を開くと任務を読める。 */
html:root body #hud #battle-notices #objectives#objectives.dismount-order:not(.expand):has(.battle-action:not([hidden]) .dismount-action) #obj-list {
 display:none !important;
}
`;
export const noticeStyle23 = `
/* なぞる札は実際に触る始点のそばへまとめる。 */
html:root.touch body #hud #battle-notices:not(.choosing):has(#objectives.enemy-move-help:not(.expand)) {
 transform:none !important; overflow:visible !important;
}
html:root.touch body #hud #battle-notices:not(.choosing) #objectives#objectives.enemy-move-help:not(.expand) {
 position:fixed !important; inset:auto !important;
 transform:var(--enemy-order-move,translate(16px,80px)) !important;
 left:0 !important; top:0 !important;
 width:max-content !important; min-width:44px !important; max-width:calc(100vw / 3 - 24px) !important;
 height:auto !important; min-height:44px !important; max-height:none !important;
 margin:0 !important; padding:6px 8px !important;
 background:#14120f !important; border:0 !important;
}
html:root.touch body #hud #objectives#objectives.enemy-move-help:not(.expand),
html:root.touch body #hud #objectives#objectives.enemy-move-help:not(.expand) * { pointer-events:none !important; }
html:root.touch body #hud #battle-notices #objectives#objectives.enemy-move-help:not(.expand) > :not(#obj-list),
html:root.touch body #hud #battle-notices #objectives#objectives.enemy-move-help:not(.expand) #obj-list > :not(.cur),
html:root.touch body #hud #battle-notices #objectives#objectives.enemy-move-help:not(.expand) li.cur > :not(.obj-text) { display:none !important; }
html:root.touch body #hud #battle-notices #objectives#objectives.enemy-move-help:not(.expand) :is(#obj-list,li.cur,.obj-text,.obj-now) {
 display:block !important; width:auto !important; margin:0 !important; padding:0 !important;
 font-size:max(16px,calc(16px * var(--text-scale,1))) !important; line-height:1.4 !important;
}
html:root.touch body #hud #battle-notices #objectives#objectives.enemy-move-help:not(.expand) :is(.swipe-instruction svg,.enemy-swipe,.facing-gesture,.facing-hand) { display:none !important; }
`;
export const noticeStyle24 = `
/* 体力は全ての戦で名前・割合・四分割の目盛りをそろえる。 */
html:root body #hud .bl #h-hp.hp i,
html:root body #hud .bl #h-hp.hp.healthy i,
html:root body #hud.single-guide .bl #h-hp.hp i {
 height:14px !important; border:1px solid #fff3df; box-sizing:border-box;
}
html:root body #hud .bl #h-hp.hp i::after {
 content:''; display:block; position:absolute; inset:0; pointer-events:none;
 background:linear-gradient(to right,transparent calc(100% - 2px),#14120f 0) 0 0 / 25% 100%;
}
/* 手ほどきが終わった戦では、札の中にも操作図を再表示しない。 */
html:root.touch body #hud.single-guide:not(.opening) #objectives .swipe-instruction svg { display:none !important; }
/* 戦の途中も今の指示一枚を残す。図だけへ畳まず、一覧の押し場も保つ。 */
html:root body #hud.compact-battle #battle-notices:not(.choosing) #objectives#objectives:not(.expand):not(.notice-muted) {
 min-width:44px !important; min-height:44px !important; height:auto !important;
 width:max-content !important; max-width:min(280px,calc(100vw / 3 - 24px)) !important;
}
html:root body #hud.compact-battle #battle-notices #objectives#objectives:not(.expand):not(.notice-muted) :is(#obj-list,li.cur,.obj-text,.obj-now) {
 display:block !important; visibility:visible !important; font-size:max(16px,calc(16px * var(--text-scale,1))) !important;
 line-height:1.4 !important; white-space:normal !important;
}
/* 携帯横の守り札は端の一行。補足は読み上げ用の説明に残す。 */
@media (max-height:500px) {
 html:root.touch body #hud #wait-guard#wait-guard:not([hidden]) {
  display:flex !important; align-items:center; justify-content:center;
  left:auto !important; right:calc(8px + env(safe-area-inset-right, 0px)) !important;
  top:auto !important; bottom:calc(8px + env(safe-area-inset-bottom, 0px)) !important;
  width:max-content !important; max-width:calc(100vw / 3 - 16px) !important;
  min-width:44px !important; min-height:48px !important; height:auto !important;
  padding:8px 12px !important; gap:0 !important; border-width:2px !important;
 }
 html:root.touch.tc-sw body #hud #wait-guard#wait-guard:not([hidden]) {
  right:auto !important; left:calc(8px + env(safe-area-inset-left, 0px)) !important;
 }
 html:root.touch body #hud #wait-guard#wait-guard:not([hidden]) :is(svg,small,.guard-meter) {
  display:none !important;
 }
 html:root.touch body #hud #wait-guard#wait-guard:not([hidden]) span {
  font-size:max(18px,calc(18px * var(--text-scale,1))) !important;
  line-height:1.3 !important; white-space:normal !important; margin:0 !important;
 }
}
`;
