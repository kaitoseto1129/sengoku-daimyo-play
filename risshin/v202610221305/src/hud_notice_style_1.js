export const noticeStyle1 = `
#hud #battle-notices #battle-message { gap:8px; }
#hud #objectives.combat-order-quiet:not(.expand) { visibility:hidden !important; pointer-events:none !important; }
#hud #battle-notices #battle-message > :is(#subtitle,.battle-notice) {
  position:relative !important; inset:auto !important; transform:none !important;
  width:100% !important; max-width:100% !important; margin:0 !important; box-sizing:border-box;
  height:auto !important; max-height:none !important; flex:0 0 auto;
  white-space:normal; overflow-wrap:anywhere; overflow:visible;
  text-overflow:clip; color:#ece4d2; background:#14120f !important;
}
#hud #battle-notices #battle-message > :is(#subtitle,.battle-notice).warn { color:#ffcf7a; }
#hud #battle-notices #battle-message #subtitle :is(.sp,.sys,.more) { color:#ece4d2; }
html body #hud #battle-notices #battle-message > #subtitle,
html.touch body #hud #battle-notices #battle-message > div#subtitle,
html.touch.tc-low body #hud #battle-notices #battle-message > div#subtitle {
  display:block !important; writing-mode:horizontal-tb !important;
  min-height:44px !important; font-size:max(15px, calc(15px * var(--text-scale, 1))) !important; line-height:1.6 !important;
}
/* 隠した字幕を表示用の規則で戻さない。空の黒札と余白を残さない。 */
html body #hud #battle-notices:not(.choosing) > #battle-message[hidden],
html body #hud #battle-notices #battle-message > :is(#subtitle,.battle-notice):is([hidden],.notice-muted) {
  display:none !important;
}
html body #hud #battle-notices:not(.choosing) > #battle-message {
  width:fit-content !important; max-width:100% !important;
  min-height:0 !important; padding:0 !important; background:none !important;
}
html body #hud #battle-notices #battle-message > .battle-notice {
  width:fit-content !important; min-height:0 !important;
  padding:6px 10px !important;
}
/* 台詞を横並びの伸縮枠にすると、本文が一文字幅まで押し潰される。 */
#hud #battle-notices #battle-message #subtitle > span { display:inline !important; width:auto !important; white-space:normal !important; }
#hud #battle-notices #battle-message #subtitle .sp { display:inline !important; margin:0 .5em 0 0 !important; }
#hud #battle-notices #battle-message #subtitle .more { display:none !important; }
/* 台詞の表示指定より先に、非表示の札を畳む。空の台詞で警告の上を塞がない。 */
html body #hud.anegawa-notices #battle-notices #battle-message > div#subtitle:is([hidden],.notice-muted) { display:none !important; }
/* 姉川のパソコン表示は、声と任務を同じ欄へ積み、小地図と中央の敵を空ける。 */
@media (min-height:501px) {
  html:not(.touch) body #hud.anegawa.mission-visible #battle-notices:not(.choosing):not(:has(#objectives.expand)) {
    left:16px !important; right:auto !important; top:104px !important;
    width:min(320px, 30vw) !important; gap:8px; max-height:calc(100% - 304px) !important;
  }
  html:not(.touch) body #hud.anegawa.mission-visible #battle-notices:not(.choosing) > :is(#objectives,#battle-message) {
    position:relative !important; inset:auto !important; transform:none !important;
    width:100% !important; height:auto !important; flex:0 0 auto; min-width:0;
  }
  html:not(.touch) body #hud.anegawa #battle-notices #objectives:not(.expand) :is(li.cur,.obj-text,.obj-now,.battle-action) {
    min-width:0 !important; max-width:100% !important; width:auto !important;
    white-space:normal !important; overflow-wrap:anywhere; height:auto !important;
    max-height:none !important; overflow:visible; line-height:1.4 !important;
    font-size:max(20px, calc(20px * var(--text-scale, 1))) !important;
  }
}
/* 箕作の縦に余裕がある画面では、任務と知らせを左の同じ欄へ収める。 */
@media (min-height:501px) {
  html body #hud.mitsukuri #battle-notices:not(.choosing),
  html body #hud.mitsukuri.mission-visible #battle-notices:not(.choosing):not(:has(#objectives.expand)) {
    left:16px !important; right:auto !important; top:104px !important;
    width:min(320px, 30vw) !important; gap:8px; max-height:calc(100% - 304px);
  }
  html body #hud.mitsukuri #battle-notices:not(.choosing) > :is(#objectives,#battle-message),
  html body #hud.mitsukuri.combat-instruction #battle-notices:not(.choosing) #objectives:not(.expand) {
    position:relative !important; inset:auto !important; transform:none !important;
    width:100% !important; height:auto !important; flex:0 0 auto; min-width:0; max-width:100% !important;
  }
  html body #hud.mitsukuri #battle-notices #objectives:not(.expand) :is(li.cur,.obj-text,.obj-now) {
    white-space:normal !important; overflow-wrap:anywhere; height:auto !important;
    max-height:none !important; overflow:visible; line-height:1.4 !important;
  }
  /* パソコンでも人数と手当ての末尾を読む。共通の二行省略より、この戦の欄を優先する。 */
  html body #hud.mitsukuri #battle-notices:not(.choosing) #objectives:not(.expand) {
    width:100% !important; min-width:0 !important; padding:8px !important;
  }
  html body #hud.mitsukuri.mission-visible #battle-notices:not(.choosing) #objectives:not(.expand) #obj-list li.cur :is(.obj-text,.obj-now),
  html body #hud.mitsukuri.mission-visible #battle-notices:not(.choosing) #objectives:not(.expand) .battle-action:not([hidden]) {
    font-size:max(18px, calc(18px * var(--text-scale, 1))) !important;
    line-height:1.5 !important; white-space:normal !important; overflow-wrap:anywhere;
    height:auto !important; max-height:none !important; overflow:visible !important;
    -webkit-line-clamp:unset; line-clamp:unset;
  }
  html body #hud.mitsukuri.mission-visible #battle-notices:not(.choosing) #objectives:not(.expand) .battle-action:not([hidden]) {
    display:block !important;
  }
  html body #hud.mitsukuri #battle-notices:not(.choosing) #objectives:not(.expand) #obj-list li.cur small {
    font-size:max(14px, calc(14px * var(--text-scale, 1))) !important;
    white-space:normal !important; overflow-wrap:anywhere; line-height:1.5 !important;
    height:auto !important; max-height:none !important; overflow:visible !important;
  }
}
/* 天王寺と鳥取のパソコン表示は、手ほどきも任務も同じ欄で縦に積む。 */
@media (min-height:501px) {
  /* 後ろの共通の任務表示より優先し、天王寺の札を小地図へ戻さない。 */
  html body #hud.tennoji.mission-visible #battle-notices:not(.choosing):not(:has(#objectives.expand)),
  html body #hud:is(.tennoji,.tottori) #battle-notices:not(.choosing) {
    left:16px !important; right:auto !important; top:104px !important;
    width:min(320px, 30vw) !important; gap:8px; max-height:calc(100% - 304px) !important;
  }
  html body #hud:is(.tennoji,.tottori) #battle-notices:not(.choosing) > :is(#objectives,#battle-message,#tutorial,#banner,#situation,#skiphint) {
    position:relative !important; inset:auto !important; transform:none !important;
    width:100% !important; height:auto !important; flex:0 0 auto; min-width:0;
    max-height:none !important; white-space:normal; overflow-wrap:anywhere;
  }
}
/* 天王寺では補足と任務を横に押し合わず、一つずつ欄の幅で読む。 */
html body #hud.tennoji #battle-notices #objectives:not(.expand) li.cur {
  display:block !important; width:100%; box-sizing:border-box;
}
html body #hud.tennoji #battle-notices #objectives:not(.expand) :is(.obj-text,.obj-now,.battle-action) {
  display:block; flex:none; width:auto !important; min-width:0 !important; max-width:100% !important;
  height:auto !important; max-height:none !important; white-space:normal !important;
  overflow-wrap:anywhere !important; word-break:normal; overflow:visible !important;
}
html body #hud.tennoji #battle-notices :is(#subtitle,#tutorial,#banner,#situation,.battle-notice) {
  height:auto !important; max-height:none !important; white-space:normal !important;
  overflow-wrap:anywhere; overflow:visible !important; box-sizing:border-box;
}
#hud #objectives.attack-order .obj-now { white-space:nowrap; }
#hud .mk.wait-goal b { white-space:nowrap; }
#hud .mk.wait-goal.arrived::after { content: none; }
#hud.honnoji .place-word { display:inline-block; white-space:nowrap; }
#hud.honnoji :is(#objectives li,.tl .next) { height:auto !important; max-height:none !important; white-space:normal; overflow:visible; line-height:1.5; }
#hud.honnoji #staring { left:calc(50% - 94px); top:calc(50% + 48px); }
/* 有岡のパソコン表示は、任務・手ほどき・使番を同じ欄に積んで地図から離す。 */
@media (min-height:501px) {
  html body #hud.arioka #battle-notices:not(.choosing),
  html body #hud.arioka.mission-visible #battle-notices:not(.choosing):not(:has(#objectives.expand)) {
    left:16px !important; right:auto !important; top:104px !important;
    width:min(320px, 30vw) !important; gap:8px; max-height:calc(100% - 304px) !important;
  }
  html body #hud.arioka #battle-notices:not(.choosing) > :is(#objectives,#battle-message,#tutorial,#banner,#situation,#skiphint),
  html body #hud.arioka #battle-notices :is(#subtitle,.battle-notice,#tutorial.coach,.what,.how) {
    position:relative !important; inset:auto !important; transform:none !important;
    width:100% !important; min-width:0; height:auto !important; min-height:0;
    max-height:none !important; flex:0 0 auto; white-space:normal !important;
    overflow-wrap:anywhere; box-sizing:border-box;
  }
  html body #hud.arioka #battle-notices #objectives:not(.expand) :is(li.cur,.obj-text,.obj-now,.battle-action) {
    display:block; width:auto !important; min-width:0; max-width:100%;
    height:auto !important; max-height:none !important; white-space:normal !important;
    overflow-wrap:normal; word-break:normal; line-break:strict;
    overflow:visible; line-height:1.5 !important;
  }
  /* 足元の案内に切り替わっても、下知は左の同じ欄で読む。 */
  html body #hud.arioka #battle-notices:not(.choosing) > #objectives.ground-order:not(.expand) {
    position:relative !important; inset:auto !important; transform:none !important;
    width:100% !important; max-width:100% !important;
  }
}
/* 有岡の横画面は札を左へ寄せ、木戸の敵と進む通りを空ける。 */
@media (min-width:601px) and (max-height:500px) {
  html.touch body #hud.arioka #battle-notices:not(.choosing),
  html.touch body #hud.arioka #battle-notices:not(.choosing):not(:has(#objectives.expand)) {
    left:calc(76px + env(safe-area-inset-left, 0px)) !important;
    right:auto !important;
    width:min(280px, calc(40vw - 84px - env(safe-area-inset-left, 0px))) !important;
  }
  /* 足元へ追従する共通の固定札も欄へ戻す。矢印と敵の頭に任務を重ねない。 */
  html.touch body #hud.arioka #battle-notices:not(.choosing) > #objectives.ground-order:not(.expand) {
    position:relative !important; inset:auto !important;
    width:100% !important; max-width:100% !important;
  }
}
#hud.honnoji #staring + .combat-cue-label { left:calc(50% - 102px) !important; top:calc(50% + 72px) !important; }
#hud.honnoji .mk:has(.behind-label) .behind-label { font-size:14px; padding:4px 6px; }
/* 本能寺の狭い廊下では、右から寄る兵の顔と刃を札で隠さない。 */
@media (min-width:601px) and (max-height:500px) {
  html.touch #hud.honnoji #battle-notices:not(.choosing),
  html.touch.tc-low #hud.honnoji #battle-notices:not(.choosing) {
    left:calc(76px + env(safe-area-inset-left, 0px)) !important;
    right:auto !important;
    width:min(280px, calc(40vw - 84px - env(safe-area-inset-left, 0px))) !important;
  }
}
/* 台詞・知らせが出る間は任務の下に二行分を収め、下の操作帯の手前まで欄を広げる。 */
html.touch body #hud #battle-notices:not(.choosing):has(#battle-message:not([hidden])) {
  max-height:calc(100% - var(--notice-top, 60px) - env(safe-area-inset-top, 0px) - max(104px, var(--notice-floor, calc(104px + env(safe-area-inset-bottom, 0px))))) !important;
}
@media (max-height:500px) {
  /* 長い文は欄の中で送り、戦場の四分の三と下の操作を空ける。 */
  html.touch #hud #battle-notices:not(.choosing),
  html.touch.tc-low #hud #battle-notices:not(.choosing),
  html.touch #hud #battle-notices:not(.choosing):has(#objectives.expand),
  html.touch.tc-low #hud #battle-notices:not(.choosing):has(#objectives.expand) {
    height:auto;
    max-height:min(25vh, calc(100% - var(--notice-top, 60px) - env(safe-area-inset-top, 0px) - max(104px, var(--notice-floor, calc(104px + env(safe-area-inset-bottom, 0px))))));
    overflow-y:auto;
  }
}
#hud #target.notice-muted { display:none !important; }
/* 岩村の携帯横向きだけ、任務と声を左へ寄せて敵の頭と照準を空ける。 */
@media (min-width:601px) and (max-height:500px) {
  html.touch #hud.iwamura #battle-notices:not(.choosing),
  html.touch.tc-low #hud.iwamura #battle-notices:not(.choosing) {
    left:calc(76px + env(safe-area-inset-left, 0px)) !important;
    right:auto !important;
    width:min(280px, calc(40vw - 84px - env(safe-area-inset-left, 0px))) !important;
  }
}
`;
export const noticeStyle2 = `
/* 横向きの携帯は短い任務を先に読む。札の面積は戦場の三分の一より小さく保つ。 */
@media (max-height:500px) {
 html.touch body #hud #battle-notices:not(.choosing) {
  width:min(300px, 34vw) !important;
  max-height:min(33vh, calc(100% - var(--notice-top, 60px) - env(safe-area-inset-top, 0px) - max(104px, var(--notice-floor, 104px)))) !important;
 }
 html.touch body #hud #battle-notices #objectives:not(.expand) .victory-condition { display:none !important; }
 html.touch body #hud #battle-notices #objectives li.cur,
 html.touch body #hud #battle-notices #battle-message > :is(#subtitle,.battle-notice) {
  font-size:max(16px, calc(16px * var(--text-scale, 1))) !important; line-height:1.45 !important;
 }
 html.touch body #hud #battle-notices #objectives li.cur small.goal-place {
  font-size:max(18px, calc(18px * var(--text-scale, 1))) !important;
  white-space:normal !important; overflow-wrap:anywhere !important;
 }
 html.touch body #hud #markers .mk :is(b,small) { font-size:max(20px, calc(20px * var(--text-scale, 1))) !important; font-weight:800; }
 html.touch body #hud :is(.battle-action,#battle-notices #objectives li.cur,#battle-notices #battle-message > :is(#subtitle,.battle-notice)) { font-size:max(20px, calc(20px * var(--text-scale, 1))) !important; font-weight:800; line-height:1.4 !important; }
 /* 有岡は期限と守る場所を短く読み、秒の一字だけを次の行へ送らない。 */
 html.touch body #hud.arioka #battle-notices #objectives:not(.expand) :is(li.cur,.battle-action),
 html.touch body #hud.arioka #battle-notices #objectives:not(.expand) li.cur :is(.obj-text,.obj-now) {
  height:auto !important; max-height:none !important; white-space:normal !important;
  overflow:visible !important; word-break:normal; overflow-wrap:normal !important;
  line-break:strict; font-size:max(16px, calc(16px * var(--text-scale, 1))) !important; line-height:1.4 !important;
 }
 html.touch body #hud #combo,
 html.touch body #hud .combat-cue-label { display:none !important; }
 html.touch body #hud.danger-notice #battle-message { order:-2 !important; }
 html.touch body #hud.danger-notice #markers { visibility:hidden !important; }
}
#hud #boss { font-size:max(18px, calc(18px * var(--text-scale, 1))) !important; line-height:1.4; letter-spacing:0; background:#14120f; padding:4px 8px; box-sizing:border-box; }
html body #hud #boss.field-boss {
 position:absolute; right:auto !important; bottom:auto !important; width:max-content !important;
 max-width:140px !important; min-width:0 !important; margin:0 !important;
 transform:translate(-50%, -100%) !important; font-size:16px !important;
 color:#ffd0c4; border-bottom:3px solid #ffd0c4; pointer-events:none;
}
html body #hud #boss.field-boss.symbol-only { background:none; border:0; padding:0; font-size:26px !important; text-shadow:0 2px 3px #14120f; }
html body #hud #boss.field-boss.symbol-only::after { display:none; }
html body #hud #boss.field-boss span { font-size:inherit !important; }
html body #hud #boss.field-boss:not(.edge)::after {
 content:'▼'; position:absolute; top:100%; left:50%; transform:translateX(-50%); color:#ffd0c4;
 font-size:18px; line-height:18px; text-shadow:0 2px 2px #14120f;
}
html body #hud #battle-notices #objectives.flag-order:not(.expand) li.cur .obj-now {
 font-size:max(28px, calc(28px * var(--text-scale, 1))) !important; line-height:1.4;
}
#hud #target.field-target {
 position:absolute; transform:translate(-50%, -100%); margin:0; padding:4px 8px;
 background:rgba(12,10,8,.92); color:#fff1cd; border:1px solid #fff1cd;
 pointer-events:none; white-space:nowrap;
}
#hud #target.field-target span { font-size:max(16px, calc(16px * var(--text-scale, 1))); line-height:1.4; color:#fff1cd; }
#hud #target.field-target span::before { content:none; }
#hud #target.field-target svg { width:20px; height:20px; align-self:center; }
#hud #markers .mk.main::before {
 width:16px; height:20px; border:0; border-left:2px solid #fff1cd; transform:none;
 background:linear-gradient(#f3d98a,#f3d98a) left top / 14px 11px no-repeat;
}
/* 設楽原の任務と声は同じ欄に積み、小地図と重ねない。 */
@media (min-height:501px) {
 html body #hud.shitaragahara.mission-visible #battle-notices:not(.choosing):not(:has(#objectives.expand)),
 html body #hud.shitaragahara #battle-notices:not(.choosing) {
  left:16px !important; right:auto !important; top:104px !important;
  width:min(320px, 30vw) !important; gap:8px; max-height:calc(100% - 304px) !important;
 }
 html body #hud.shitaragahara #battle-notices:not(.choosing) > :is(#objectives,#battle-message,#tutorial,#banner,#situation,#skiphint),
 html body #hud.shitaragahara #battle-notices:not(.choosing) #objectives.ground-order:not(.expand) {
  position:relative !important; inset:auto !important; transform:none !important;
  width:100% !important; min-width:0 !important; max-width:100% !important;
  height:auto !important; max-height:none !important; flex:0 0 auto; box-sizing:border-box;
 }
 html body #hud.shitaragahara #battle-notices #objectives:not(.expand) :is(li.cur,.obj-text,.obj-now,.battle-action) {
  min-width:0 !important; max-width:100% !important; height:auto !important;
  white-space:normal !important; overflow-wrap:anywhere !important;
  overflow:visible !important; line-height:1.4 !important;
 }
}
@media (max-height:500px) {
 html.touch body #hud.shitaragahara #battle-notices #objectives:not(.expand) li.cur .obj-now {
  font-size:max(18px, calc(18px * var(--text-scale, 1))); white-space:normal; overflow-wrap:anywhere;
 }
 html.touch body #hud.shitaragahara #battle-notices:not(.choosing) #objectives:not(.expand) li.cur small:not(.goal-place) { display:none !important; }
}
`;
