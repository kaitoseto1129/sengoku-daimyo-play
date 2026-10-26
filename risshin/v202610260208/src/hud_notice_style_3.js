export const noticeStyle6 = `
/* 全戦共通。中央を空け、墨は文字の周りだけに留める。拡大文字と任務一覧は維持する。 */
html body #hud:not(.hc) #battle-notices:not(.choosing) {
 width:min(300px, 30vw) !important; max-height:30vh !important; gap:4px;
}
html body #hud:not(.hc) #battle-notices :is(#objectives,#banner,#subtitle,#tutorial,#situation,#skiphint,.battle-notice) {
 background:rgba(12,10,8,.74) !important; color:#fff3df;
 padding:4px 8px !important; border-radius:2px; box-shadow:none !important;
 text-shadow:0 1px 2px #000, 1px 0 1px #000;
}
html body #hud:not(.hc) #battle-notices:not(.choosing) #objectives:not(.expand) :is(li.cur,.obj-text,.obj-now,.battle-action),
html body #hud:not(.hc) #battle-notices:not(.choosing) :is(#tutorial,#subtitle,.battle-notice) {
 font-size:max(16px, calc(16px * var(--text-scale, 1))) !important; line-height:1.4 !important;
}
/* 常設の指図は行ごとの墨にする。折り返しの右や押せる余白には戦場を残す。 */
html body #hud:not(.hc):not(:is(.guard-guide,.flag-guide,.person-guide)) #battle-notices:not(.choosing) #objectives:not(.expand):not(.has-action) {
 background:none !important; border:0; padding:4px 6px !important;
 min-height:44px; border-radius:0;
}
html body #hud:not(.hc) #battle-notices:not(.choosing) #objectives:not(.expand):not(.has-action) #obj-list li.cur,
html body #hud:not(.hc) #battle-notices:not(.choosing) #objectives:not(.expand):not(.has-action) #obj-list li.cur :is(.obj-text,.obj-now) {
 font-size:max(16px, calc(16px * var(--text-scale, 1))) !important;
 font-weight:600 !important; line-height:1.65 !important;
}
html body #hud:not(.hc):not(:is(.guard-guide,.flag-guide,.person-guide)) #battle-notices:not(.choosing) #objectives:not(.expand):not(.has-action) #obj-list li.cur .obj-now {
 display:inline !important; padding:2px 5px;
 background:rgba(12,10,8,.8); color:#fff3df;
 -webkit-box-decoration-break:clone; box-decoration-break:clone;
 text-shadow:0 1px 2px #000;
}
html body #hud #battle-notices #objectives > #tutorial:not([hidden]):not(.notice-muted) {
 display:block !important; background:none !important; border:0; padding:4px 0 0 !important;
 min-height:0; box-shadow:none !important;
}
html body #hud #battle-notices #objectives > #tutorial :is(.lbl,.how) {
 display:block !important; font-size:max(13px, calc(13px * var(--text-scale, 1))); line-height:1.4;
}
html body #hud #battle-notices #objectives > #tutorial :is(.what,.how) { margin:2px 0 0; }
html body #hud #battle-notices #objectives > #tutorial .lbl { display:none !important; }
html body #hud:not(.hc) #battle-notices .battle-notice.warn { color:#ffcf7a; }
/* 常設の任務は黒い一枚板にせず、折り返した文字の行だけに墨を敷く。
   押せる外枠と全文の折り返しは保ち、行末と行間から戦場を見せる。 */
html body #hud:not(.hc):not(:is(.guard-guide,.flag-guide,.person-guide)) #battle-notices:not(.choosing) #objectives:not(.expand) {
 background:none !important; border:0 !important; box-shadow:none !important;
}
html body #hud:not(.hc) #battle-notices:not(.choosing) #objectives:not(.expand) li.cur .obj-now,
html body #hud:not(.hc) #battle-notices:not(.choosing) #objectives:not(.expand) .battle-action:not([hidden]) {
 display:inline !important; background:rgba(12,10,8,.88);
 padding:2px 4px; -webkit-box-decoration-break:clone; box-decoration-break:clone;
 line-height:1.7 !important;
}
/* 補足と手ほどきにも下地を残す。非表示の説明を表示し直さない。 */
html body #hud:not(.hc) #battle-notices:not(.choosing) #objectives:not(.expand) li.cur small,
html body #hud:not(.hc) #battle-notices:not(.choosing) #objectives:not(.expand) > #tutorial:not([hidden]):not(.notice-muted) {
 background:rgba(12,10,8,.88) !important;
}
/* 字幕の旧来の携帯指定にも同じ小さな下地を適用する。 */
html.touch.tc-low body #hud:not(.hc) #battle-notices #battle-message > div#subtitle,
html body #hud:not(.hc) #battle-notices #battle-message > :is(#subtitle,.battle-notice) {
 background:rgba(12,10,8,.74) !important; padding:4px 8px !important;
 font-size:max(16px, calc(16px * var(--text-scale, 1))) !important; line-height:1.4 !important;
}
/* 共通の案内板は横幅を保ち、接敵中は今の指図だけを二行に収める。 */
html body #hud #battle-notices:not(.choosing) #objectives:not(.expand) {
 min-width:220px !important; box-sizing:border-box;
}
html body #hud.combat-brief #battle-notices:not(.choosing) #objectives:not(.expand) :is(h4,li:not(.cur),.tag,small,.obj-full,.victory-condition,.opb),
html body #hud.combat-brief #battle-notices #objectives:not(.expand) > #tutorial:not([hidden]):not(.notice-muted) {
 display:none !important;
}
html body #hud.combat-brief #battle-notices:not(.choosing) #objectives.has-action:not(.expand):has(.battle-action:not([hidden])) #obj-list {
 display:none !important;
}
html body #hud.combat-brief #battle-notices:not(.choosing) #objectives:not(.expand) li.cur {
 display:block !important; margin:0 !important; padding:0 !important;
}
html body #hud.combat-brief #battle-notices:not(.choosing) #objectives:not(.expand) li.cur::before { display:none !important; }
html body #hud.combat-brief #battle-notices:not(.choosing) #objectives:not(.expand) :is(.obj-now,.battle-action:not([hidden])) {
 display:-webkit-box !important; -webkit-box-orient:vertical; -webkit-line-clamp:2;
 line-clamp:2; line-height:1.4 !important; max-height:2.8em !important;
 overflow:hidden !important; white-space:normal !important;
}
/* 箕作の人数条件は二行で切らない。携帯横向きでも閉じ括弧まで読む。 */
@media (max-height:500px) {
 html body #hud.mitsukuri.combat-brief #battle-notices:not(.choosing) #objectives:not(.expand) :is(.obj-now,.battle-action:not([hidden])) {
  display:block !important; -webkit-line-clamp:unset; line-clamp:unset;
  height:auto !important; max-height:none !important; overflow:visible !important;
 }
}

`;
export const noticeStyle7 = `
/* 畳んだ札に、一覧用の絶対位置と本文を持ち越さない。距離は本文の次の行へ置く。 */
html body #hud #battle-notices:not(.choosing) #objectives:not(.expand) #obj-list li.cur :is(.obj-text,.obj-now,small) {
 position:static !important; inset:auto !important; transform:none !important;
 float:none !important; columns:auto !important; writing-mode:horizontal-tb !important;
}
html body #hud #battle-notices:not(.choosing) #objectives:not(.expand) #obj-list li.cur .obj-full {
 display:none !important;
}
html body #hud #battle-notices:not(.choosing) #objectives:not(.expand) #obj-list li.cur small.goal-place {
 display:block; margin:2px 0 0 !important; line-height:1.4 !important;
}
/* 城下では案内札と台詞を八つ分離し、名前と本文を左揃えで読む。 */
html body #hud.town #battle-notices:not(.choosing),
html.touch.tc-low body #hud.town #battle-notices:not(.choosing) {
 display:flex !important; flex-direction:column !important; gap:8px !important;
 max-height:calc(100% - 172px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)) !important;
}
html body #hud.town #battle-notices #battle-message > #subtitle,
html.touch.tc-low body #hud.town #battle-notices #battle-message > #subtitle {
 width:100% !important; text-align:left !important; text-indent:0 !important;
}
html body #hud.town #battle-notices #battle-message #subtitle .sp,
html.touch.tc-low body #hud.town #battle-notices #battle-message #subtitle .sp {
 display:block !important; margin:0 0 4px !important;
}
#hud.town #battle-notices #battle-message #subtitle .town-sentence {
 display:block !important; white-space:normal !important;
}
/* 頭上の盾を出しても、指示と操作は共通の札に残す。 */
html body #hud.single-guide:is(.guard-guide,.flag-guide,.person-guide) #battle-notices:not(.choosing) #objectives:not(.expand):not(.has-action) #obj-list {
 display:block !important;
}
html body #hud.single-guide #battle-notices:not(.choosing) #objectives.has-action:not(.expand):has(.battle-action:not([hidden])) #obj-list {
 display:none !important;
}
/* 戦の指示は同じ場所で読む。印への追従と、戦闘中の操作説明の省略を止める。 */
html body #hud.single-guide #battle-notices:not(.choosing) #objectives:not(.expand) {
 position:relative !important; inset:auto !important; transform:none !important;
 width:100% !important; min-width:44px !important; max-width:100% !important;
 min-height:44px !important;
}
html body #hud.single-guide #battle-notices:not(.choosing) #objectives:not(.expand) :is(.obj-now,.battle-action:not([hidden])) {
 font-size:max(24px, calc(24px * var(--text-scale, 1))) !important;
 display:block !important; -webkit-line-clamp:unset; line-clamp:unset;
 max-height:none !important; overflow:visible !important; line-height:1.4 !important;
}
html body #hud.single-guide #battle-notices:not(.choosing) #objectives:not(.expand) .battle-action:not([hidden]) small {
 display:block !important; font-size:max(16px, calc(16px * var(--text-scale, 1))) !important;
 line-height:1.4 !important; margin-top:4px;
}
@media (max-height:500px) {
 html body #hud.single-guide #battle-notices:not(.choosing):not(:has(#objectives.expand)) {
  left:calc(50% - 150px) !important; right:auto !important;
  top:calc(48px + env(safe-area-inset-top, 0px)) !important; bottom:auto !important;
  width:300px !important; max-width:calc(100vw - 232px) !important;
  max-height:30vh !important;
 }
}
`;
export const noticeStyle8 = `
/* 行動がある時は同じ任務を繰り返さず、一枚の札にする。 */
html body #hud #battle-notices:not(.choosing) #objectives.has-action:not(.expand):has(.battle-action:not([hidden])) #obj-list li.cur .obj-text {
 display:none !important;
}
/* 操作の助言がない時も、今することを一枚残す。 */
html body #hud.single-guide #battle-notices:not(.choosing) #objectives:not(.expand):not(:has(.battle-action:not([hidden]))) #obj-list,
html body #hud.single-guide #battle-notices:not(.choosing) #objectives:not(.expand):not(:has(.battle-action:not([hidden]))) #obj-list li.cur .obj-text {
 display:block !important;
}
/* 戦う一人を示した時も、既存の任務札に短い行動を必ず残す。 */
html body #hud.single-guide #battle-notices:not(.choosing) #objectives.attack-order:not(.expand) #obj-list,
html body #hud.single-guide #battle-notices:not(.choosing) #objectives.attack-order:not(.expand) #obj-list li.cur,
html body #hud.single-guide #battle-notices:not(.choosing) #objectives.attack-order:not(.expand) #obj-list li.cur .obj-text {
 display:block !important;
}
/* 話す札は頭上の吹き出しにつなぎ、遠い相手との対応を保つ。 */
html body #hud.single-guide #battle-notices:not(.choosing) #objectives.talk-order:not(.expand) {
 position:fixed !important; left:var(--talk-order-x) !important; top:var(--talk-order-y) !important;
 right:auto !important; bottom:auto !important; transform:translate(-50%, -100%) !important;
 width:max-content !important; max-width:min(240px, 40vw) !important;
}
html body #hud.edge-destination #battle-notices:not(.choosing) #objectives:not(.expand),
html body #hud.talk-located #battle-notices:not(.choosing) #objectives:not(.expand),
html body #hud.single-guide:has(#prompt.talk-target:not([hidden])) #battle-notices:not(.choosing) #objectives:not(.expand) {
 display:none !important;
}
html body #hud.guard-guide #battle-notices:not(.choosing) #objectives.ground-order:not(.expand) {
 position:fixed !important; inset:auto !important;
 left:var(--ground-order-x) !important; top:var(--ground-order-y) !important;
 width:max-content !important; max-width:min(240px, 30vw) !important;
}
/* 反撃札は親の幅も広げる。携帯横でも末尾を折り返さない。 */
html.touch body #hud #battle-notices:not(.choosing):has(#objectives.attack-help:not(.expand)) {
 width:max-content !important; max-width:calc(100vw - 144px) !important;
 left:50% !important; right:auto !important; transform:translateX(-50%);
 overflow:visible !important;
}
html.touch body #hud #battle-notices:not(.choosing) #objectives.attack-help:not(.expand) {
 width:max-content !important; max-width:100% !important; min-height:44px !important;
}
html.touch body #hud #battle-notices:not(.choosing) #objectives.attack-help:not(.expand) .battle-action.attack-action:not([hidden]) {
 width:max-content !important; max-width:none !important; white-space:nowrap !important;
 overflow-wrap:normal !important; word-break:keep-all !important;
 font-size:max(20px, calc(20px * var(--text-scale, 1))) !important;
}
html.touch body #hud .battle-action.attack-action::before { content:'◎ '; color:#fff3ba; }
/* 敵の指図は相手のすぐ上へ。操作は同じ一枚の二行に収める。 */
html.touch body #hud.single-guide #battle-notices:not(.choosing):has(#objectives.enemy-order:not(.expand)) {
 transform:none !important; left:16px !important; right:auto !important;
}

html:root body #hud #battle-notices:not(.choosing) #objectives.enemy-order:not(.expand) {
 position:fixed !important; inset:auto !important;
 left:0 !important; top:0 !important;
 transform:var(--enemy-order-move,translate(16px,80px)) !important;
 width:max-content !important; max-width:min(240px, 40vw) !important;
 min-height:44px !important; max-height:none !important; overflow:visible !important;
}
html:root body #hud.single-guide #battle-notices:not(.choosing) #objectives.enemy-order:not(.expand) {
 max-width:min(260px, 38vw) !important;
}
html body #hud.single-guide #battle-notices #objectives.enemy-order:not(.expand) #obj-list { display:block !important; }
html body #hud.single-guide #battle-notices #objectives.enemy-order:not(.expand) #obj-list > li:not(.cur) { display:none !important; }
html body #hud.single-guide #battle-notices #objectives.enemy-order .battle-action::before { content:none !important; }
html body #hud.single-guide #battle-notices:not(.choosing) #objectives.enemy-order:not(.expand) .battle-action:not([hidden]) small {
 display:block !important; font-size:max(18px, calc(18px * var(--text-scale, 1))) !important; white-space:normal !important;
}
/* 敵の脇の指から、そのまま上へなぞれる一枚の案内。 */
html:root body #hud.single-guide #battle-notices:not(.choosing) #objectives:not(.expand) .battle-action.approach-swipe:not([hidden]) {
 display:flex !important; align-items:center; gap:8px;
 font-size:max(24px,calc(24px * var(--text-scale,1))) !important;
 line-height:1.4 !important; white-space:nowrap !important;
}
#hud .approach-swipe .enemy-swipe { display:block; flex:none; width:64px; height:96px; }
html:root body #hud #objectives:has(.approach-swipe:not([hidden])):not(.expand),
html:root body #hud #objectives:has(.approach-swipe:not([hidden])):not(.expand) * { pointer-events:none !important; }
/* 突く時は今の操作だけを読み、長い任務は札を開いた時に読む。 */
html body #hud #battle-notices:not(.choosing) #objectives.attack-help:not(.expand) #obj-list { display:none !important; }
html body #hud #battle-notices:not(.choosing) #objectives.attack-help:not(.expand) .battle-action.attack-action small {
 display:block !important; font-size:max(18px, calc(18px * var(--text-scale, 1))) !important;
}
html body #hud.single-guide .battle-action.attack-action::before { content:none !important; }
html body #hud.single-guide .battle-action.attack-action.spear-action::before {
 content:'' !important; display:inline-block; width:16px; height:32px; margin-right:8px; vertical-align:middle;
 background:#fff3ba; clip-path:polygon(50% 0,100% 38%,62% 52%,62% 100%,38% 100%,38% 52%,0 38%);
}
html.touch body #hud .battle-action.attack-action::before,
html.touch body #hud.single-guide .battle-action.attack-action.spear-action::before { content:none !important; }
/* 旗の指図と地上の旗を同じ切り込みの形で結ぶ。札は増やさない。 */
html body #hud.single-guide #battle-notices:not(.choosing) #objectives.goal-flag-order:not(.expand) li.cur .obj-now::before {
 content:'' !important; display:inline-block !important; width:20px; height:28px;
 margin-right:8px; vertical-align:middle; border:0; border-radius:0;
 background:#fff3ba; clip-path:polygon(0 100%,0 0,100% 0,75% 21%,100% 43%,10% 43%,10% 100%);
}
`;
export const noticeStyle9 = `
/* 旗の案内は一枚の大きな札。地面の印のそばへ置き、一覧を開く広さも保つ。 */
html body #hud.single-guide #battle-notices:not(.choosing) #objectives.flag-travel-order.ground-order:not(.expand) {
 position:fixed !important; inset:auto !important;
 left:var(--ground-order-x) !important; top:var(--ground-order-y) !important;
 width:max-content !important; max-width:min(420px, calc(100vw - 32px)) !important;
 min-height:44px !important;
}
/* 地面へ寄せる札の座標は画面を基準にし、親の移動を重ねない。 */
html body #hud #battle-notices:not(.choosing):has(#objectives.ground-order:not(.expand)) { transform:none !important; }
html body #hud.single-guide #battle-notices:not(.choosing) #objectives.flag-travel-order:not(.expand):not(.has-action) #obj-list li.cur .obj-now {
 font-size:max(24px, calc(24px * var(--text-scale, 1))) !important;
 font-weight:800 !important; line-height:1.4 !important;
}
/* 今することを先に大きく読み、距離などの補足は次の行にまとめる。 */
html body #hud.single-guide #battle-notices:not(.choosing) #objectives:not(.expand) #obj-list li.cur .obj-now {
 font-size:max(24px, calc(24px * var(--text-scale, 1))) !important; font-weight:800 !important;
}
html body #hud.single-guide #battle-notices:not(.choosing) #objectives:not(.expand) #obj-list li.cur small.goal-place {
 font-size:max(18px, calc(18px * var(--text-scale, 1))) !important; font-weight:800;
}
html body #hud.single-guide .bl #h-hp em { overflow-wrap:normal; word-break:keep-all; }
/* 移動中の札は同じ場所で読み、相手と同じ形の印で結ぶ。 */
html body #hud.single-guide #battle-notices:not(.choosing) #objectives:is(.talk-order,.route-order):not(.ground-order):not(.expand) {
 position:relative !important; inset:auto !important; transform:none !important;
 width:100% !important; max-width:100% !important; min-height:44px !important;
 padding:6px 8px !important; background:#14120f !important;
}
html body #hud.single-guide #battle-notices #objectives:is(.talk-order,.route-order):not(.expand) #obj-list li.cur .obj-now::before {
 content:'' !important; display:inline-block !important; width:28px; height:32px;
 margin-right:8px; vertical-align:middle; background:#fff3ba;
 clip-path:polygon(0 0,100% 0,100% 64%,64% 64%,50% 100%,42% 64%,0 64%);
}
/* 向きは戸口の矢印一つで示し、任務札に下向き矢印を重ねない。 */
html body #hud.single-guide #battle-notices #objectives.route-order:not(.expand) #obj-list li.cur .obj-now::before {
 content:none !important; display:none !important;
}
html body #hud.single-guide #battle-notices #objectives.talk-order:not(.expand) .destination-cue { display:none !important; }
/* 歩数の末尾を落とさず、大きな一行で読む。札は既存の一枚を使う。 */
html body #hud.single-guide #battle-notices:not(.choosing) #objectives.flag-travel-order:not(.expand) {
 width:max-content !important; max-width:calc(100vw - 32px) !important;
}
html body #hud.single-guide #battle-notices #objectives.flag-travel-order:not(.expand) li.cur .obj-now {
 white-space:nowrap !important; overflow-wrap:normal !important; word-break:keep-all !important;
}
html body #hud.single-guide .bl #h-hp.hp { min-width:204px; box-sizing:border-box; }
@media (max-height:500px) {
 html body #hud.single-guide #battle-notices:not(.choosing):not(:has(#objectives.expand)) {
  left:calc(50% - 150px) !important; top:calc(16px + env(safe-area-inset-top, 0px)) !important;
  width:300px !important; max-height:30vh !important;
 }
 html body #hud.single-guide #battle-notices:not(.choosing) #objectives:not(.expand) #obj-list li.cur .obj-now {
  font-size:max(20px,calc(20px * var(--text-scale,1))) !important; line-height:1.4 !important;
 }
}

`;
export const noticeStyle10 = `
/* 傷の長い説明で列が広がり、命の棒と残りの数が札から出るのを防ぐ。 */
html body #hud.arioka .bl #h-hp.hp {
 grid-template-columns:minmax(0,1fr) max-content !important;
}
html body #hud.arioka .bl #h-hp.hp em {
 min-width:0; max-width:100%; overflow-wrap:anywhere; word-break:normal;
 font-size:max(16px,calc(16px * var(--text-scale,1))) !important;
}
html body #hud.arioka #battle-notices:not(.choosing):has(#objectives.keep-combat-task) #objectives.keep-combat-task:not(.expand) {
 display:block !important; position:relative !important; inset:auto !important;
 transform:none !important; width:100% !important; min-width:0 !important; max-width:100% !important;
}
html body #hud.arioka #battle-notices:not(.choosing):has(#objectives.keep-combat-task) #objectives.keep-combat-task:not(.expand) #obj-list,
html body #hud.arioka #battle-notices:not(.choosing):has(#objectives.keep-combat-task) #objectives.keep-combat-task:not(.expand) #obj-list li.cur .obj-text,
html body #hud.arioka #battle-notices:not(.choosing):has(#objectives.keep-combat-task) #objectives.keep-combat-task:not(.expand) #obj-list li.cur > small:not(.goal-place):not(.obj-cue) {
 display:block !important;
}
html body #hud.arioka #battle-notices:not(.choosing):has(#objectives.keep-combat-task) #objectives.keep-combat-task:not(.expand) #obj-list li.cur :is(.obj-now,small),
html body #hud.arioka #battle-notices:not(.choosing):has(#objectives.keep-combat-task) #objectives.keep-combat-task:not(.expand) .battle-action:not([hidden]) {
 height:auto !important; max-height:none !important; overflow:visible !important;
 white-space:normal !important; overflow-wrap:anywhere !important;
 font-size:max(16px,calc(16px * var(--text-scale,1))) !important; line-height:1.4 !important;
}
html body #hud.arioka #battle-notices:not(.choosing):has(#objectives.keep-combat-task) #objectives.keep-combat-task:not(.expand) #obj-list li.cur > small:not(.goal-place):not(.obj-cue) {
 font-size:max(13px,calc(13px * var(--text-scale,1))) !important;
 /* 人数と期限の改行を保ち、数字と「人」「秒」を別の行へ割らない。 */
 white-space:pre-line !important; overflow-wrap:normal !important; word-break:keep-all !important;
}
@media (min-width:601px) and (max-height:500px) {
 html.touch body #hud.arioka #battle-notices:not(.choosing):not(:has(#objectives.expand)) {
  left:calc(76px + env(safe-area-inset-left,0px)) !important; right:auto !important;
  width:280px !important; max-width:calc(100vw - 176px) !important;
  /* 退避中も下知と期限を収める。命の札と下の操作帯は空ける。 */
  max-height:min(52vh,calc(100% - var(--notice-top,60px) - env(safe-area-inset-top,0px) - max(104px,var(--notice-floor,104px)))) !important;
 }
}
`;
export const noticeStyle11 = `
/* 横の携帯でも大きな字と太い棒で、命と足のけがを一枚にまとめる。 */
html body #hud .bl #h-hp.hp {
 width:max(184px,calc(168px * var(--text-scale,1) + 16px)); min-width:0;
 gap:3px 8px; padding:5px 8px;
}
html body #hud .bl #h-hp.hp :is(span,.hp-remaining) {
 font-size:max(22px,calc(22px * var(--text-scale,1))) !important;
}
html body #hud .bl #h-hp.hp > span { display:none !important; }
html body #hud .bl #h-hp.hp .hp-remaining { grid-column:1 / -1; justify-self:start; }
html body #hud .bl #h-hp.hp i { height:18px !important; border-width:2px; }
html body #hud .bl #h-hp.hp em {
 font-size:max(20px,calc(20px * var(--text-scale,1))) !important;
 white-space:normal; overflow-wrap:anywhere; word-break:normal;
}
html body #hud .bl #h-hp.hp em svg { width:28px; height:32px; }
html body #hud.single-guide .bl #h-hp.hp { min-width:0; }
body:has(#hud.retreat-priority) #tc .stick b { display:none !important; }
/* 退避の操作は足元の丸と矢印で示し、札から指の絵を張り出させない。 */
/* 元気な時は一行だけ。傷の説明も二行に収め、戦場を空ける。 */
html body #hud .bl:has(#h-hp.healthy) { width:max-content !important; min-width:0 !important; }
html body #hud .bl #h-hp.hp.healthy {
 width:max-content !important; min-width:0 !important; padding:3px 6px; background:rgba(20,18,15,.85);
}
html body #hud .bl #h-hp.hp.healthy .hp-remaining { font-size:max(16px,calc(16px * var(--text-scale,1))) !important; }
/* 命の残量は大きな数字と太い一本の棒で示す。 */
html body #hud .bl #h-hp.hp i { display:block !important; flex:none; width:184px; max-width:100%; min-width:0; height:22px !important; }
html body #hud .bl #h-hp.hp em {
 font-size:max(22px,calc(22px * var(--text-scale,1))) !important; line-height:1.35; white-space:normal;
}
/* 命の残量と細い棒を横に並べ、端が薄れる帯で足元を空ける。 */
html body #hud .bl:has(#h-hp.hp) {
 width:max-content !important; min-width:0 !important; max-width:calc(100vw - 32px);
 padding:0; background:none; box-shadow:none;
}
html body #hud .bl #h-hp.hp,
html body #hud .bl #h-hp.hp.healthy {
 display:flex !important; flex-direction:row; flex-wrap:wrap; align-items:center; gap:3px 10px; width:max-content !important;
 max-width:min(320px,calc(100vw - 32px)); min-width:0; padding:4px 20px 4px 8px;
 background:linear-gradient(90deg,rgba(20,18,15,.88) calc(100% - 12px),rgba(20,18,15,0));
}
html body #hud.combat-focus:not(.hc) .bl #h-hp.hp {
 padding:4px 20px 4px 8px; background:linear-gradient(90deg,rgba(20,18,15,.88) calc(100% - 12px),rgba(20,18,15,0)); box-shadow:none;
}
html body #hud .bl #h-hp.hp .hp-remaining,
html body #hud .bl #h-hp.hp.healthy .hp-remaining {
 font-size:max(16px,calc(16px * var(--text-scale,1))) !important;
 line-height:1.4; white-space:nowrap; letter-spacing:0; font-variant-numeric:tabular-nums;
}
html body #hud .bl #h-hp.hp i,
html body #hud.combat-focus .bl #h-hp.hp i {
 width:144px; height:6px !important; padding:0; border:0;
 background:rgba(20,18,15,.88); box-shadow:0 0 0 1px rgba(236,228,210,.35);
}
html body #hud .bl #h-hp.hp i strong { inset:0; background:#ece4d2; }
/* 深手・出血の文字と囲みは残し、色だけで危険を伝えない。 */
html body #hud .bl #h-hp.hp:is(.deep,.blood-loss) {
 background:#14120f;
}
html body #hud .bl #h-hp.hp:is(.deep,.blood-loss) .hp-remaining {
 font-size:max(18px,calc(18px * var(--text-scale,1))) !important;
}
html body #hud.hc .bl #h-hp.hp { background:#14120f; }
html body #hud.hc .bl #h-hp.hp i { box-shadow:0 0 0 1px #fff; }
html body #hud .bl #h-hp.hp em {
 font-size:max(16px,calc(16px * var(--text-scale,1))) !important;
 flex-basis:100%; line-height:1.4; white-space:normal; overflow-wrap:anywhere; background:none;
}
/* 深手と出血は枠と言葉を保ち、残量も一段大きくする。 */
html body #hud .bl #h-hp.hp:is(.deep,.blood-loss) .hp-remaining {
 font-size:max(18px,calc(18px * var(--text-scale,1))) !important;
}
html body #hud .bl #h-hp.hp .hp-remaining { order:0; }
html body #hud .bl #h-hp.hp i { order:1; }
html body #hud .bl #h-hp.hp em { order:2; }
html body #hud .bl #h-hp.hp em::before { content:none; }
html body #hud .bl #h-hp.hp em small { display:block; }
html body #hud .bl #h-hp.hp em small::before { content:none; }
html body #hud .bl #h-hp.hp em svg { display:none; }
/* 軽いけがの退避中は、次の操作より命の数字を大きくしない。 */
html body #hud.retreat-priority .bl #h-hp.hp:not(.deep):not(.blood-loss) .hp-remaining {
 font-size:max(18px,calc(18px * var(--text-scale,1))) !important;
}
/* 無傷の命は細い残量計にする。黒い札で川原や足元を隠さず、傷の警告は元の大きさで残す。 */
html body #hud:not(.hc) .bl:has(#h-hp.hp.healthy) {
 padding:4px 6px; gap:0; background:none; box-shadow:none; border:0;
}
html body #hud:not(.hc) .bl #h-hp.hp.healthy {
 padding:2px 0; gap:4px; background:none; border:0; box-shadow:none;
}
html body #hud:not(.hc) .bl #h-hp.hp.healthy .hp-remaining {
 font-size:max(16px,calc(16px * var(--text-scale,1))) !important;
 line-height:1.4; text-shadow:0 1px 2px #000, 1px 0 1px #000, -1px 0 1px #000;
}
html body #hud:not(.hc) .bl #h-hp.hp.healthy i {
 height:8px !important; border:1px solid #fff3df; padding:0; background:#14120f;
 box-shadow:0 1px 2px #14120f;
}
html body #hud:not(.hc) .bl #h-hp.hp.healthy i strong { inset:1px; background:#fff3df; }
/* 画面外の話し相手は名前と矢印の一枚へまとめる。 */
html body #hud #battle-notices #objectives:not(.expand) .obj-now .task-phrase { display:inline-block; white-space:nowrap; }
html body #hud:is(.talk-located,.talk-ready) #battle-notices:not(.choosing) #objectives:not(.expand) { display:none !important; }
/* 退く下知は画面端へ収め、旗や兵を追って中央へ動かさない。 */
html body #hud #battle-notices:not(.choosing) #objectives.travel-retreat.ground-order.destination-sign:not(.expand) {
 position:fixed !important; inset:auto !important; transform:none !important;
 left:var(--ground-order-x) !important; top:var(--ground-order-y) !important;
 width:max-content !important; max-width:min(272px,40vw) !important;
 min-height:44px !important; padding:6px 10px !important; background:#14120f !important;
}
/* 退く案内は二行にまとめ、携帯でも末尾の一字を折り返さない。 */
html body #hud.single-guide #battle-notices:not(.choosing) #objectives.travel-retreat.ground-order.destination-sign:not(.expand) #obj-list li.cur .obj-now {
 display:block !important; font-size:max(18px,calc(18px * var(--text-scale,1))) !important;
 line-height:1.4 !important; white-space:normal !important; overflow-wrap:normal !important;
 word-break:normal !important; padding:0 !important;
}

html body #hud.single-guide #battle-notices #objectives.travel-retreat.destination-sign:not(.expand) li.cur > small {
 display:none !important;
}
/* 今の札に指と矢印を添える。触れた指は背後の見回す操作へ通す。 */
html.touch body #hud #battle-notices:not(.choosing) #objectives.turn-coach:not(.expand) {
 position:fixed !important; inset:auto !important; transform:none !important;
 left:var(--turn-coach-x) !important; top:var(--turn-coach-y) !important;
 width:240px !important; max-width:40vw !important; min-height:44px !important;
 padding:6px 10px !important; background:#14120f !important; pointer-events:none !important;
}
html.touch body #hud #battle-notices #objectives.turn-coach:not(.expand) .battle-action {
 font-size:max(20px,calc(20px * var(--text-scale,1))) !important; color:#fff3ba;
}
#hud #objectives.turn-coach .battle-action::before { display:none !important; }
html.touch body #hud #objectives.turn-coach:not(.expand) * { pointer-events:none !important; }
#hud .turn-gesture { display:block; width:200px; max-width:100%; height:82px; margin:4px auto 0; pointer-events:none; }
/* 矢印と既存の任務札を一組にする。親の欄の幅や位置を引き継がない。 */
html body #hud.single-guide #battle-notices:not(.choosing) #objectives.linked-destination.ground-order:not(.expand) {
 position:fixed !important; inset:auto !important;
 left:var(--ground-order-x) !important; top:var(--ground-order-y) !important;
 width:max-content !important; max-width:min(240px,40vw) !important;
 min-height:44px !important; padding:6px 10px !important; transform:none !important;
}
html body #hud.single-guide #battle-notices #objectives.linked-destination:not(.expand) #obj-list li.cur :is(.obj-text,.obj-now) {
 font-size:max(24px,calc(24px * var(--text-scale,1))) !important; font-weight:900 !important; line-height:1.3 !important;
}
html body #hud #battle-notices #objectives.linked-destination:not(.expand) :is(li.cur small,.obj-tag) { display:none !important; }
html body #hud.single-guide #battle-notices #objectives.linked-destination:not(.expand) li.cur :is(.obj-full,.tag) { display:none !important; }
html body #hud.single-guide #battle-notices #objectives.linked-destination:not(.expand) li.cur .obj-now { white-space:nowrap !important; }
html body #hud #battle-notices #battle-message > :is(#subtitle,.battle-notice),
html.touch body #hud #battle-notices #battle-message > .battle-notice.warn {
 font-size:max(16px,calc(16px * var(--text-scale,1))) !important;
}
/* 横向きの携帯では会話を二十の字で読む。既存の一枠を使う。 */
@media (max-height:500px) and (orientation:landscape) {
 html body #hud #battle-notices #battle-message > div#subtitle,
 html.touch body #hud #battle-notices #battle-message > div#subtitle,
 html.touch.tc-low body #hud #battle-notices #battle-message > div#subtitle {
  font-size:max(20px,calc(20px * var(--text-scale,1))) !important;
  line-height:1.4 !important; background:#14120f !important;
 }
}
/* 家の札は戸口の旗の横へ置き、屋根の上へ戻さない。操作の広さは保つ。 */
html body #hud #battle-notices:not(.choosing) #objectives.work-order:not(.expand) {
 position:fixed !important; inset:auto !important; transform:none !important;
 left:var(--work-order-x) !important; top:var(--work-order-y) !important;
 width:max-content !important; max-width:min(200px,30vw) !important;
 min-height:44px !important; max-height:none !important; margin:0 !important;
}
html body #hud #battle-notices #objectives.work-order:not(.expand) li.cur small { display:none !important; }
/* 天王寺の退避も任務欄で読む。地面の印へ札を移して補足や距離を切らない。 */
@media (max-height:500px) {
 html body #hud.tennoji.mission-visible #battle-notices:not(.choosing):not(:has(#objectives.expand)),
 html body #hud.tennoji #battle-notices:not(.choosing):not(:has(#objectives.expand)) {
  left:calc(50% - 142px) !important; right:auto !important;
  top:calc(20px + env(safe-area-inset-top,0px)) !important; bottom:auto !important;
  width:284px !important; max-width:calc(100vw - 232px) !important;
  max-height:calc(100% - 164px) !important;
 }
 html body #hud.tennoji #battle-notices:not(.choosing) #objectives:not(.expand),
 html body #hud.tennoji #battle-notices:not(.choosing) #objectives.travel-retreat:not(.expand) {
  position:relative !important; inset:auto !important; transform:none !important;
  width:100% !important; min-width:44px !important;
  height:auto !important; max-height:none !important; overflow:visible !important;
 }
 html body #hud.tennoji #battle-notices:not(.choosing) #objectives:not(.expand) #obj-list li.cur,
 html body #hud.tennoji #battle-notices:not(.choosing) #objectives:not(.expand) #obj-list li.cur :is(.obj-text,.obj-now,small) {
  height:auto !important; max-height:none !important; overflow:visible !important;
  white-space:normal !important; -webkit-line-clamp:unset !important; line-clamp:unset !important;
 }
 html body #hud.tennoji #battle-notices:not(.choosing) #objectives:not(.expand) #obj-list li.cur .obj-now {
  font-size:max(16px,calc(16px * var(--text-scale,1))) !important; line-height:1.4 !important;
 }
 html body #hud.tennoji #battle-notices:not(.choosing) #objectives.travel-retreat:not(.expand) #obj-list li.cur .goal-place {
  display:none !important;
 }
}
`;
export const noticeStyle12 = `
/* 下馬中は押せる札だけを見せ、手当ての説明を重ねない。 */
html body #hud #battle-notices:not(.choosing) #objectives:not(.expand):has(.battle-action:not([hidden]) .dismount-action) {
 position:relative !important; inset:auto !important; transform:none !important;
 width:100% !important; max-width:100% !important;
}
html body #hud #battle-notices:not(.choosing) #objectives:not(.expand) .battle-action:not([hidden]):has(.dismount-action) {
 display:block !important; padding:0 !important; background:none !important;
}
html body #hud #objectives .battle-action:has(.dismount-action)::before { content:none !important; }
html:root body #hud #battle-notices:not(.choosing) #objectives#objectives:not(.expand):has(.battle-action:not([hidden]) .dismount-action) > :not(.battle-action) {
 display:none !important;
}
html body #hud .battle-action .dismount-action { min-height:48px; min-width:44px; font-size:max(22px,calc(22px * var(--text-scale,1))); }
/* 下馬は一つの押せる釦だけ。携帯では右の親指のそばに固定する。 */
html:root body #hud #battle-notices #objectives#objectives.dismount-order:not(.expand) > :not(.battle-action) {
 display:none !important;
}
html.touch:root body #hud #battle-notices #objectives#objectives.dismount-order:not(.expand) {
 position:fixed !important; inset:auto 16px 88px auto !important; transform:none !important;
 width:156px !important; max-width:156px !important; padding:0 !important; background:none !important;
}
html.touch:root body #hud #objectives#objectives.dismount-order .battle-action {
 position:static !important; transform:none !important; margin:0 !important; padding:0 !important;
}
html.touch:root body #hud #objectives#objectives.dismount-order .dismount-action {
 width:156px; min-height:48px; font-size:18px;
}
/* 下馬・退避・手当ての途中は、今の操作に次の指図を添えない。 */
html:root body #hud #battle-notices #objectives.sequential-order:not(.expand) #obj-list li.cur :is(small,.opb),
html:root body #hud #battle-notices #objectives.sequential-order:not(.expand) .victory-condition {
 display:none !important;
}
/* 護衛と入口の案内は既存の任務一枚だけを印のそばに置く。 */
html:root body #hud.guard-guide #battle-notices:not(.choosing) #objectives#objectives.ground-order:not(.expand) #obj-list,
html:root body #hud.guard-guide #battle-notices:not(.choosing) #objectives#objectives.ground-order:not(.expand) #obj-list li.cur,
html:root body #hud.guard-guide #battle-notices:not(.choosing) #objectives#objectives.ground-order:not(.expand) #obj-list li.cur .obj-text,
html:root body #hud.guard-guide #battle-notices:not(.choosing) #objectives#objectives.ground-order:not(.expand) #obj-list li.cur .obj-now {
 display:block !important; visibility:visible !important;
}
#hud .obj-now .guard-sign { width:22px; height:26px; margin-right:8px; vertical-align:middle; }
#hud .obj-now .rescue-sign { display:inline-block; width:28px; height:32px; margin-right:6px; vertical-align:middle; }
html:root body #hud #battle-notices #objectives.rescue-order:not(.expand)::before,
html:root body #hud #battle-notices #objectives.rescue-order:not(.expand)::after,
html:root body #hud #battle-notices #objectives.rescue-order:not(.expand) #obj-list li.cur .obj-now::before { display:none !important; }
html:root body #hud.guard-guide #battle-notices:not(.choosing) #objectives.ground-order:not(.expand) .battle-action { display:none !important; }
html:root body #hud.guard-guide #battle-notices:not(.choosing) #objectives.ground-order:not(.expand) {
 background:#14120f !important; padding:6px 10px !important;
}
html:root body #hud.guard-guide #battle-notices:not(.choosing) #objectives.ground-order:not(.expand) #obj-list li.cur :is(.obj-full,.goal-place,.obj-cue,.tag) { display:none !important; }
/* 本文がない間は、枠と下地も出さない。 */
html:root body #hud #battle-notices #objectives.empty-task { display:none !important; }
html body #hud #battle-notices:not(.choosing) #objectives.linked-destination.ground-order:not(.expand) {
 position:fixed !important; inset:auto !important; transform:none !important;
 left:var(--ground-order-x) !important; top:var(--ground-order-y) !important;
 width:max-content !important; max-width:min(240px, 30vw) !important;
}
@media (max-height:500px) {
 html.touch body #hud #battle-notices:not(.choosing) #objectives:not(.expand) #obj-list li.cur :is(.obj-text,.obj-now) {
  font-size:max(20px,calc(20px * var(--text-scale,1))) !important; line-height:1.4 !important;
 }
}
`;
export const noticeStyle13 = `
/* 向く場所と指の絵を任務一枚に収める。補足も携帯で読める大きさにする。 */
html body #hud #battle-notices:not(.choosing) #objectives:not(.expand) #obj-list li.cur small.goal-place.facing-help {
 display:block !important; font-size:max(16px,calc(16px * var(--text-scale,1))) !important;
 white-space:normal !important; line-height:1.4 !important;
}
#hud.map-guidance #minimap { display:none !important; }
#hud .approach-gesture { display:block; width:112px; height:64px; margin:0 auto; pointer-events:none; }
#hud .facing-gesture { display:block; width:80px; height:34px; margin:4px 0; pointer-events:none; }
@media (max-height:500px) {
 html body #hud #battle-notices:not(.choosing) #objectives.linked-destination.ground-order:not(.expand) {
  min-height:44px !important; padding:4px 8px !important; max-width:min(280px,34vw) !important;
 }
 html body #hud #battle-notices:not(.choosing) #objectives.linked-destination:not(.expand) #obj-list li.cur :is(.obj-text,.obj-now) {
  font-size:max(20px,calc(20px * var(--text-scale,1))) !important; line-height:1.4 !important;
 }
}
`;
