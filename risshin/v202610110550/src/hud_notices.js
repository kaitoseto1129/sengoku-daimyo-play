import { noticeReason, refreshNoticeReasons, headNoticeAllowed } from './notice_source.js';
// 戦の知らせを三枠にまとめる。札と待ち列は使い回し、毎コマ作らない。
export class BattleNotices {
  constructor(hud) {
    this.hud = hud;
    this.root = hud.root;
    this.rail = document.createElement('div');
    this.rail.id = 'battle-notices';
    this.root.appendChild(this.rail);
    this.sources = [];
    for (const [id, priority] of [['choice', 100], ['objectives', 90], ['banner', 80], ['subtitle', 70], ['tutorial', 10], ['situation', 55], ['skiphint', 60]]) {
      const el = document.getElementById(id);
      this.rail.appendChild(el);
      this.sources.push({ id, el, priority, selected: false });
    }
    this.cards = [];
    for (let i = 0; i < 3; i++) {
      const el = document.createElement('div');
      el.className = 'battle-notice'; el.hidden = true;
      el.setAttribute('role', 'status');
      el.setAttribute('aria-atomic', 'true');
      this.rail.appendChild(el);
      this.cards.push(el);
    }
    // 台詞と短い知らせは同じ一枠を使う。中身だけを入れ替える。
    this.message = document.createElement('div');
    this.message.id = 'battle-message';
    this.message.hidden = true;
    this.rail.appendChild(this.message);
    this.message.appendChild(document.getElementById('subtitle'));
    for (const el of this.cards) this.message.appendChild(el);
    // 選ぶ間だけ、任務とその更新を元の右上の欄へ戻す。
    this.taskDock = document.createElement('div');
    this.taskDock.id = 'choice-tasks';
    this.taskDock.hidden = true;
    this.root.querySelector('.tr').insertBefore(this.taskDock, document.getElementById('minimap'));
    this.queue = [];
    this.seen = new Map();
    this.picks = [];
    this.lastPicks = [null, null, null];
    this.limit = 3;
    this.shortScreen = window.matchMedia('(max-height:500px)');
    this.clock = 0;
    const style = document.createElement('style');
    style.textContent = `
#hud #battle-notices { position:absolute; left:calc(76px + env(safe-area-inset-left, 0px)); top:calc(96px + env(safe-area-inset-top, 0px)); width:min(320px, 32%); max-height:calc(100% - 196px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)); display:flex; flex-direction:column; gap:8px; overflow-y:auto; overscroll-behavior:contain; touch-action:pan-y; pointer-events:auto; }
#hud #boss { left:calc(100px + min(320px, 32%) + env(safe-area-inset-left, 0px)); right:calc(216px + env(safe-area-inset-right, 0px)); width:auto; max-width:none; margin-top:0; transform:none; min-width:0; grid-template-columns:minmax(0, 1fr); text-align:center; }
#hud #boss span { min-width:0; width:100%; max-width:100%; overflow-wrap:anywhere; box-sizing:border-box; }
#hud #boss i { width:min(360px, 100%); box-sizing:border-box; }
#hud #battle-notices :is(#choice,#objectives,#banner,#subtitle,#tutorial,#situation,#skiphint,.battle-notice) { position:relative !important; inset:auto !important; transform:none !important; width:100% !important; min-width:0 !important; max-width:100% !important; margin:0 !important; box-sizing:border-box; font-size:max(12px, calc(14px * var(--text-scale, 1))) !important; line-height:1.45 !important; letter-spacing:0 !important; padding:6px 10px !important; background:rgba(12,10,8,.9) !important; text-align:left; visibility:visible !important; opacity:1 !important; animation:none !important; flex:0 0 auto; }
#hud #battle-notices [hidden], #hud #battle-notices .notice-muted { display:none !important; }
#hud #battle-notices :is(#subtitle,#situation,#skiphint,.battle-notice):empty { display:none !important; }
#hud.ending #battle-notices #objectives { display:none !important; }
#hud #battle-message { display:flex; flex-direction:column; gap:8px; flex:0 0 auto; min-width:0; width:100%; }
#hud #objectives #battle-log-entry { min-height:44px; margin-top:8px; padding:4px 0; border-width:0 0 1px; text-align:left; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-size:max(12px, calc(12px * var(--text-scale, 1))); }
#hud #objectives #obj-list { min-height:0; margin:0; }
/* 武将の札の幅は左右の端から決める。横向きの配置へ固定幅を持ち越さない。 */
#hud #battle-notices #choice { pointer-events:auto; flex:1 1 auto; min-height:88px; max-height:none; overflow:auto; }
#hud #battle-notices #choice .opt { min-height:44px; box-sizing:border-box; align-content:center; padding:4px 0; margin-top:8px; }
#hud #battle-notices #choice .opt small { display:block; min-width:0; white-space:normal; overflow-wrap:anywhere; font-size:max(12px, calc(13px * var(--text-scale, 1))); line-height:1.4; max-height:none; overflow:visible; }
#hud #battle-notices #choice h5 { font-size:max(12px, calc(14px * var(--text-scale, 1))); margin:0 0 4px; }
#hud #battle-notices #objectives { height:auto; min-height:44px; max-height:none; overflow-wrap:anywhere; overflow:auto; pointer-events:auto; cursor:pointer; }
#hud #battle-notices #objectives h4, #hud #battle-notices #objectives li:not(.cur), #hud #battle-notices #objectives li :is(.tag,small,.opb) { display:none !important; }
#hud #battle-notices:not(.choosing) #objectives li.cur small { display:block !important; font-size:max(12px, calc(12px * var(--text-scale, 1))); }
#hud #battle-notices #objectives li.cur { display:block; font-size:max(12px, calc(14px * var(--text-scale, 1))); margin:0; padding:0; background:none; box-shadow:none; }
#hud #battle-notices:not(.choosing) #objectives.expand { max-height:none; }
#hud #battle-notices:not(.choosing) #objectives.expand li { display:block !important; }
#hud #battle-notices #banner .brush { padding:0; background:none !important; font-size:max(12px, calc(16px * var(--text-scale, 1))); -webkit-text-stroke:0; }
#hud #battle-notices #banner small { max-width:100%; margin:0; font-size:max(12px, calc(12px * var(--text-scale, 1))); letter-spacing:0; }
#hud #battle-notices #skiphint { min-height:44px; pointer-events:auto; }
#hud #battle-notices #subtitle { pointer-events:auto !important; cursor:pointer; min-height:44px; }
#hud #battle-notices #subtitle .sp { display:block; min-width:0; max-width:100%; margin:0 0 4px; white-space:normal; overflow-wrap:anywhere; }
#hud #battle-notices #subtitle::after { content:none !important; }
#hud #battle-notices #subtitle .more { display:none; }
#hud #battle-notices .battle-notice.warn { color:#ffcf7a; border-left:3px solid #ffcf7a; }
/* 折り返した字の高さまで札を伸ばす。送りが必要な時は札ごとでなく欄全体を送る。 */
#hud #battle-notices :is(#banner,#subtitle,#tutorial,#situation,#skiphint,.battle-notice) { height:auto; max-height:none; white-space:normal; overflow-wrap:anywhere; overflow:visible; pointer-events:auto; }
#hud #battle-notices.choosing { left:calc(16px + env(safe-area-inset-left, 0px)); top:calc(62px + env(safe-area-inset-top, 0px)); width:min(320px, 34vw); max-height:calc(100% - 162px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)); }
#hud #battle-notices #choice.compact .opt small { font-size:max(12px, calc(12px * var(--text-scale, 1))); }
#hud #battle-notices #choice.compact h5 { display:block; overflow:visible; }
#hud:has(#choice:not([hidden])) .tl { visibility:hidden; }
#hud #choice-tasks { width:100%; min-width:0; background:rgba(12,10,8,.9); padding:6px 10px; box-sizing:border-box; }
#hud #choice-tasks[hidden], #hud #choice-tasks > [hidden], #hud #choice-tasks > .notice-muted { display:none !important; }
#hud #choice-tasks #battle-log-entry { margin-top:8px; }
#hud #choice-tasks #objectives { visibility:visible !important; opacity:1 !important; margin:0 !important; padding:0 !important; min-height:44px; max-height:none !important; background:none !important; box-shadow:none; overflow:visible; }
#hud #choice-tasks #objectives h4, #hud #choice-tasks #objectives li:not(.cur), #hud #choice-tasks #objectives li :is(.tag,small,.opb) { display:none !important; }
#hud #choice-tasks #objectives li.cur { display:block; margin:0; padding:0; font-size:max(12px, calc(14px * var(--text-scale, 1))); line-height:1.4; background:none; box-shadow:none; }
#hud #choice-tasks .battle-notice { font-size:max(12px, calc(12px * var(--text-scale, 1))); line-height:1.4; padding-top:4px; border-top:1px solid var(--gold-line); overflow-wrap:anywhere; }
/* 任務を移す先や画面の高さにかかわらず、全文の高さで札を作る。送りは欄全体で行う。 */
#hud :is(#battle-notices,#choice-tasks) :is(#objectives li,.battle-notice) { height:auto; max-height:none; min-width:0; white-space:normal; overflow-wrap:anywhere; overflow:visible; text-overflow:clip; }
#hud:has(#intro:not([hidden])) #choice-tasks, #hud:has(#bigmap:not([hidden])) #choice-tasks, body:has(#pause:not([hidden])) #choice-tasks, #hud.photo #choice-tasks,
#hud:has(#intro:not([hidden])) #choice-tasks > *, #hud:has(#bigmap:not([hidden])) #choice-tasks > *, body:has(#pause:not([hidden])) #choice-tasks > *, #hud.photo #choice-tasks > * { visibility:hidden !important; }
#hud #battle-notices #tutorial .lbl { display:none; }
#hud #battle-notices #tutorial .how { display:block; margin:4px 0 0; font-size:max(12px, calc(13px * var(--text-scale, 1))); line-height:1.5; }
#hud #battle-notices #tutorial .what { display:block; font-size:max(12px, calc(14px * var(--text-scale, 1))); margin:0; }
#hud:has(#intro:not([hidden])) #battle-notices, #hud:has(#bigmap:not([hidden])) #battle-notices, body:has(#pause:not([hidden])) #battle-notices, #hud.photo #battle-notices { visibility:hidden; }
#hud:has(#intro:not([hidden])) #battle-notices > *, #hud:has(#bigmap:not([hidden])) #battle-notices > *, body:has(#pause:not([hidden])) #battle-notices > *, #hud.photo #battle-notices > * { visibility:hidden !important; }
#hud:has(#intro:not([hidden])) #battle-message > *, #hud:has(#bigmap:not([hidden])) #battle-message > *, body:has(#pause:not([hidden])) #battle-message > *, #hud.photo #battle-notices #battle-message > * { visibility:hidden !important; }
@media (max-height:500px) {
  /* 低い画面では欄を小さくし、長い下知は欄全体を送って読む。字は縮めない。 */
  #hud #battle-notices:not(.choosing) { left:calc(16px + env(safe-area-inset-left, 0px)); top:calc(72px + env(safe-area-inset-top, 0px)); width:min(260px, 30%); bottom:var(--notice-floor, calc(144px + env(safe-area-inset-bottom, 0px))); max-height:min(32vh, calc(100% - 72px - env(safe-area-inset-top, 0px) - var(--notice-floor, calc(144px + env(safe-area-inset-bottom, 0px))))); }
  /* 知らせの右端から24px空け、残った幅に武将の札を収める。 */
  #hud #boss { top:calc(64px + env(safe-area-inset-top, 0px)); bottom:auto; left:calc(40px + min(260px, 30%) + env(safe-area-inset-left, 0px)); right:calc(216px + env(safe-area-inset-right, 0px)); width:auto; max-width:none; }
  #hud #battle-notices #choice .opt small { font-size:max(12px, calc(12px * var(--text-scale, 1))); }
}
@media (min-height:501px) { #hud #battle-notices { max-height:min(360px, calc(100% - 196px)); } }
`;
    // 開いた任務は状態の印も読む。焦点の輪が欄の縁で欠けないよう内側に余白を取る。
    style.textContent += `
#hud #battle-notices { box-sizing:border-box; padding:8px; }
#hud #battle-notices:not(.choosing) #objectives.expand li .tag { display:inline !important; margin-right:6px; }
#hud #battle-notices:not(.choosing) #objectives.expand li small { display:block !important; }
#hud #battle-notices #objectives li.cur::before, #hud #choice-tasks #objectives li.cur::before { content:'今　'; color:var(--kin); }
#hud #choice-tasks { max-height:calc(100vh - 160px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)); overflow-y:auto; overscroll-behavior:contain; touch-action:pan-y; pointer-events:auto; }
#hud #choice-tasks #objectives.expand li { display:block !important; }
#hud #choice-tasks #objectives.expand li :is(.tag,small) { display:block !important; }
#hud #choice-tasks #objectives.expand li .tag { display:inline !important; }
#hud #choice-tasks #objectives.expand li.cur::before, #hud #battle-notices #objectives.expand li.cur::before { content:none; }
#hud #battle-notices .battle-notice.warn::before, #hud #choice-tasks .battle-notice.warn::before { content:'！ '; font-weight:700; }
#hud #battle-notices .battle-notice.warn { color:#ffcf7a; }
@media (max-height:500px) {
 html.touch.tc-low #hud #battle-notices:not(.choosing) {
  width:min(224px, 28vw); padding:4px;
  max-height:min(160px, calc(100% - 196px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)));
 }
}
`;
    // 拡大した文は切らず、決まった札の範囲で送れるようにする。
    style.textContent += `
html[data-text-size=l] #hud #battle-notices #choice.compact h5 { display:block; -webkit-line-clamp:unset; overflow:visible; }
`;
    style.textContent += `
#hud #battle-notices #subtitle .more { display:block; font-size:max(12px, calc(12px * var(--text-scale, 1))); line-height:1.6; }
#hud #battle-notices #objectives li.cur .tag, #hud #choice-tasks #objectives li.cur .tag { display:inline !important; margin-right:6px; }
#hud #choice-tasks #objectives li.cur small { display:block !important; font-size:max(12px, calc(13px * var(--text-scale, 1))); line-height:1.6; }
#hud #battle-notices #tutorial:not(.hintc) .lbl { display:block; font-size:max(12px, calc(13px * var(--text-scale, 1))); }
#hud #battle-notices.choosing { width:min(420px, calc(100vw - 340px - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px))); }
#hud #battle-notices.choosing #choice { overflow:visible; flex:0 0 auto; }
#hud #boss { top:calc(72px + env(safe-area-inset-top, 0px)); bottom:auto; right:calc(294px + env(safe-area-inset-right, 0px)); }
html[data-text-size=l] #hud #battle-notices:not(.choosing) { width:min(380px, 40vw); }
@media (max-height:500px) {
 /* 兵力の帯の下、知らせと右上の地図の間。後の指定で上端へ戻さない。 */
 #hud #boss { top:calc(72px + env(safe-area-inset-top, 0px)); right:calc(230px + env(safe-area-inset-right, 0px)); display:flex; flex-wrap:wrap; justify-content:center; align-items:center; gap:4px 12px; }
 #hud #boss span { width:auto; }
 html.touch.tc-low #hud #boss { left:calc(40px + min(224px, 28vw) + env(safe-area-inset-left, 0px)); }
 html[data-text-size=l] #hud #boss, html.touch.tc-low[data-text-size=l] #hud #boss { left:calc(40px + min(380px, 40vw) + env(safe-area-inset-left, 0px)); }
 html[data-text-size=l] #hud #battle-notices:not(.choosing) { left:calc(16px + env(safe-area-inset-left, 0px)); }
}
@media (max-width:600px) {
 #hud #battle-notices.choosing { left:calc(16px + env(safe-area-inset-left, 0px)); width:calc(100vw - 32px - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px)); }
}
#hud #intro .card { animation:none; opacity:1; max-height:calc(100dvh - 32px); max-width:calc(100vw - 32px); overflow-y:auto; overscroll-behavior:contain; box-sizing:border-box; }
/* 題が二行でも釦の位置を変えない。本文だけを送り、釦の下に余白を残す。 */
#hud #intro:has(#intro-go) > .card { height:min(440px, calc(100dvh - 32px)); overflow:hidden; padding-bottom:24px; }
#hud #intro:has(#intro-go) .intro-reading { flex:1 1 0; min-height:0; padding:8px; box-sizing:border-box; }
#hud #intro:has(#intro-go) .intro-reading:focus-visible { outline:3px solid var(--kin); outline-offset:-3px; box-shadow:none; }
#hud #intro:has(#intro-go) #intro-go { flex:0 0 auto; width:auto; margin:8px 0 0; box-sizing:border-box; }
#hud #intro:has(#intro-go) #intro-go:focus-visible { outline:3px solid var(--kin); outline-offset:2px; box-shadow:0 0 0 5px #14120f; }
@media (max-height:500px) {
  #hud #intro:has(#intro-go) > .card { padding-bottom:16px; }
}
#hud #sublog { overflow-y:auto; pointer-events:auto; touch-action:pan-y; overscroll-behavior:contain; font-size:max(15px, calc(15px * var(--text-scale, 1))); line-height:1.6; }
#hud #sublog #log-close { position:sticky; top:0; background:var(--sumi-2); z-index:1; }
#hud #h-units button.uc.ally { pointer-events:auto; cursor:pointer; border:1px solid var(--washi-dim); font-family:inherit; }
#hud #maphint { pointer-events:auto; width:min(640px, calc(100vw - 32px)); min-width:0; max-width:calc(100vw - 32px); max-height:calc(100dvh - 96px); overflow-y:auto; overscroll-behavior:contain; touch-action:pan-y; white-space:normal; box-sizing:border-box; }
#hud #maphint :is(details,.lg,.op) { width:100%; box-sizing:border-box; }
#hud #maphint .lg { flex-wrap:wrap; }
#hud #maphint details { font-size:max(15px, calc(15px * var(--text-scale, 1))); line-height:1.6; }
#hud #crosshair.blocked-hit::after { content:'◇'; color:var(--washi); font-size:24px; }
#hud #crosshair.hit:not(.blocked-hit)::after { content:'×'; color:var(--washi); font-size:24px; }
#hud #target.locked { border:2px solid var(--kin); }
#hud #h-units { max-width:min(440px, 48vw); max-height:96px; overflow-x:auto; overflow-y:hidden; flex-wrap:nowrap; touch-action:pan-x; pointer-events:auto; }
#hud #h-units .uc { flex:0 0 auto; }
#hud #objectives:not(.expand) li.folded-task { display:none !important; }
#hud #objectives.expand li.more { display:none !important; }
#hud #battle-notices.has-more::after { content:'▼ 下に選択肢があります'; position:sticky; bottom:0; background:var(--sumi-2); padding:8px; font-size:13px; }
#hud #radial .rw { pointer-events:auto; min-height:44px; cursor:pointer; }
#hud #radial > .rg { position:absolute; left:248px; top:-96px; bottom:auto; width:min(280px, 22vw); display:flex; gap:8px; flex-wrap:wrap; max-width:60vw; max-height:180px; overflow-y:auto; overscroll-behavior:contain; padding:8px; background:rgba(12,10,8,.95); pointer-events:auto; }
#hud #radial .rg button { color:var(--washi); background:var(--sumi-2); border:1px solid var(--washi-dim); font:inherit; font-size:max(12px, calc(13px * var(--text-scale, 1))); }
#hud #radial .rg button.on { border-color:var(--kin); background:#3c3020; }
#hud #radial .rg button.on::before { content:'● '; }
#hud #radial .rg small { display:block; }
@media (max-height:500px) { html.touch #hud #radial > .rg { left:200px; top:-100px; width:min(250px, 28vw); max-height:160px; } }
#hud :is([role=button],[role=menuitem]):focus-visible { outline:3px solid var(--kin); outline-offset:2px; box-shadow:0 0 0 5px var(--sumi-2); }
`;
    style.textContent += `
#hud #battle-notices #objectives li.more, #hud #choice-tasks #objectives li.more { display:block !important; font-size:max(12px, calc(12px * var(--text-scale, 1))); line-height:1.6; }
#hud #objectives.expand li.more { display:none !important; }
#hud #objectives:not(.expand) li.task-help { display:none !important; }
#hud #objectives.expand li.task-help small { display:block !important; }
#hud #battle-notices.choosing #objectives li.cur small { display:block !important; }
`;
    style.textContent += `
@media (max-height:500px) {
 /* 左の歩く範囲は画面の34%。選ぶ札はその右で、下の操作を空けて送る。 */
 html.touch #hud #battle-notices.choosing { left:calc(34vw + 8px + env(safe-area-inset-left, 0px)); width:min(360px, calc(66vw - 184px - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px))); bottom:var(--notice-floor, calc(144px + env(safe-area-inset-bottom, 0px))); max-height:calc(100% - 62px - env(safe-area-inset-top, 0px) - var(--notice-floor, calc(144px + env(safe-area-inset-bottom, 0px)))); }
 html.touch #hud #choice-tasks { max-height:20vh; }
 /* 選ぶ間は任務と選択肢を優先し、小地図は選んだ直後に戻す。 */
 html.touch #hud:has(#choice:not([hidden])) #minimap { display:none; }
 /* 上下を固定すると空白まで札の領域になる。中身の高さに収め、長い時だけ送る。 */
 #hud #battle-notices:not(.choosing) { bottom:auto; height:auto; }
 /* 補足だけ畳む。今の任務も開いた任務も、知らせも折り返し、欄全体を送って全文を読む。 */
 #hud #battle-notices:not(.choosing) > :is(#objectives,#banner,#subtitle,#tutorial,#situation,#skiphint,.battle-notice) { display:block; max-height:none; overflow:visible; }
 #hud #battle-notices:not(.choosing) #objectives li.cur { display:block; white-space:normal; overflow-wrap:anywhere; overflow:visible; }
 /* 平時も選ぶ時と同じく歩く範囲の右へ置き、札の総面積は欄の高さで抑える。 */
 html.touch #hud #battle-notices:not(.choosing), html.touch.tc-low #hud #battle-notices:not(.choosing) { left:calc(34vw + 8px + env(safe-area-inset-left, 0px)); top:calc(72px + env(safe-area-inset-top, 0px)); width:min(280px, calc(66vw - 184px - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px))); bottom:auto; max-height:140px; padding:4px; pointer-events:auto; }
 html.touch #hud:has(#boss:not([hidden])) #battle-notices:not(.choosing) { top:calc(176px + env(safe-area-inset-top, 0px)); }
 #hud #battle-notices:not(.choosing) #objectives:not(.expand) li :is(.tag,small), #hud #battle-notices:not(.choosing) #objectives li.more,
 #hud #battle-notices:not(.choosing) #subtitle .more, #hud #battle-notices:not(.choosing) #tutorial :is(.lbl,.how), #hud #battle-notices:not(.choosing) #banner small { display:none !important; }
 #hud #battle-notices:not(.choosing) #subtitle .sp { display:inline; margin:0 6px 0 0; }
 #hud #battle-notices:not(.choosing) :is(#banner .brush,#tutorial .what) { font-size:inherit; line-height:inherit; }
}
@media (min-height:501px) {
 #hud .tl #battle-log-entry { position:absolute; left:400px; top:88px; width:230px; margin:0; }
}
`;
    // 欄の空白と読むだけの知らせは、下の歩く操作へ指を通す。
    style.textContent += `
#hud #battle-notices { pointer-events:none; }
#hud #battle-notices.choosing { pointer-events:none; }
#hud #battle-notices #choice { pointer-events:none; }
#hud #battle-notices #choice .opt { pointer-events:auto; }
#hud #battle-notices :is(#banner,#tutorial,#situation,.battle-notice) { pointer-events:none; }
/* 読む札の上からも欄を送る。指を通す指定では、切れた続きへ届かなかった。 */
#hud #battle-notices .battle-notice { pointer-events:auto; }
@media (max-height:500px) {
 /* 上の操作の下に二枠。大きな指の丸でも右側の352pxを空ける。 */
 html.touch #hud #battle-notices:not(.choosing),
 html.touch.tc-low #hud #battle-notices:not(.choosing) {
  --notice-top:60px;
  left:calc(176px + env(safe-area-inset-left, 0px));
  top:calc(var(--notice-top) + env(safe-area-inset-top, 0px));
  bottom:auto;
  width:min(280px, calc(100vw - 552px - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px)));
  padding:4px;
  gap:4px;
  /* 二・三行の任務と知らせを積める高さにする。下の名前札との間は8px空ける。 */
  max-height:calc(100% - var(--notice-top) - env(safe-area-inset-top, 0px) - max(96px, var(--notice-floor, calc(96px + env(safe-area-inset-bottom, 0px)))));
  pointer-events:none;
 }
 html.touch #hud #battle-message { gap:4px; }
 html.touch.tc-sw #hud #battle-notices:not(.choosing) {
  left:calc(368px + env(safe-area-inset-left, 0px)); right:auto;
 }
 html.touch #hud:has(#boss:not([hidden])) #battle-notices:not(.choosing) { --notice-top:60px; top:calc(var(--notice-top) + env(safe-area-inset-top, 0px)); }
 /* 携帯用と低画質用の高さ制限を外し、移した任務の全文は欄を送って読む。 */
 html.touch #hud #battle-notices #objectives,
 html.touch #hud #battle-notices #objectives:has(li.cur.long),
 html.touch.tc-low #hud #battle-notices #objectives,
 html.touch.tc-low #hud #battle-notices #objectives:has(li.cur.long) {
  max-height:none; overflow:visible;
 }
 /* 選ぶ間の右上の任務も含め、文は札の幅で折り返す。送りは親の欄に任せる。 */
 html.touch #hud :is(#battle-notices,#choice-tasks) #objectives li {
  min-width:0; max-height:none; white-space:normal; overflow-wrap:anywhere; overflow:visible;
 }
 /* 今の任務も札の幅で折り返し、全文を欄の中で送って読める。 */
 html.touch #hud :is(#battle-notices,#choice-tasks) #objectives:not(.expand) li.cur {
  display:block; min-height:44px; white-space:normal;
 }
 html.touch #hud :is(#battle-notices,#choice-tasks) #objectives:not(.expand) li.cur::before { flex:0 0 auto; }
 html.touch #hud :is(#battle-notices,#choice-tasks) #objectives:not(.expand) .obj-text {
  display:inline; min-width:0; overflow:visible; white-space:normal; overflow-wrap:anywhere; text-overflow:clip;
 }
 html.touch #hud :is(#battle-notices,#choice-tasks) #objectives:not(.expand) li :is(.tag,small,.opb),
 html.touch #hud :is(#battle-notices,#choice-tasks) #objectives:not(.expand) li.more { display:none !important; }
 /* 普段の札は上と下の細い帯だけ。軍の細かな情報は地図と号令で読む。 */
 html.touch #hud :is(.tl,#armybar,#compass), html.touch body :is(#sonae-cards,#yasen-hud,#siegecards) { display:none !important; }
 html.touch.tc-low #hud .tr { width:72px; right:calc(8px + env(safe-area-inset-right, 0px)); top:calc(8px + env(safe-area-inset-top, 0px)); margin-top:0; }
 html.touch #hud #minimap { width:64px !important; height:64px !important; opacity:1 !important; }
 html.touch.tc-low #hud #boss, html.touch.tc-low[data-text-size=l] #hud #boss {
  left:calc(304px + env(safe-area-inset-left, 0px)); right:calc(96px + env(safe-area-inset-right, 0px));
  top:calc(8px + env(safe-area-inset-top, 0px)); margin-top:0; padding:4px 8px;
  font-size:max(12px, calc(12px * var(--text-scale, 1))); background:#14120f; color:#ece4d2;
 }
 html.touch #hud #boss span { font-size:inherit; }
 html.touch #hud #boss i { height:4px; }
 html.touch #hud > #battle-log-entry {
  position:absolute !important; left:calc(176px + env(safe-area-inset-left, 0px)) !important;
  top:calc(8px + env(safe-area-inset-top, 0px)) !important; width:112px !important;
  padding:4px; line-height:1.3; margin:0;
 }
 html.touch #hud:has(#intro:not([hidden])) > #battle-log-entry,
 html.touch #hud:has(#bigmap:not([hidden])) > #battle-log-entry,
 html.touch body:has(#pause:not([hidden])) #hud > #battle-log-entry,
 html.touch #hud.photo > #battle-log-entry { visibility:hidden; }
 html.touch.tc-low #hud .bl {
  left:var(--pm-l, 34vw); right:auto; width:min(220px, calc(100vw - var(--pm-l, 34vw) - var(--pm-r2, 352px)));
  bottom:calc(8px + env(safe-area-inset-bottom, 0px)); box-sizing:border-box; padding:4px 6px; gap:0;
  background:#14120f; color:#ece4d2; opacity:1; margin:0;
 }
 html.touch.tc-low #hud .bl #h-who { display:block !important; margin:0; font-size:max(12px, calc(12px * var(--text-scale, 1))); line-height:1.4; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
 html.touch #hud .bl #h-who small { display:none; }
 html.touch.tc-low #hud .bl #h-hp { grid-template-columns:auto minmax(0, 1fr) auto; gap:4px; line-height:1.4; }
 html.touch.tc-low #hud .bl #h-hp :is(span,em) { display:block; font-size:max(12px, calc(12px * var(--text-scale, 1))); color:#ece4d2; }
 html.touch.tc-low #hud .bl #h-hp.deep :is(span,em) { color:#e38a74; }
 html.touch #hud .bl #h-hp i { height:5px; }
 html.touch.tc-low #hud #h-squad:not([hidden]) { bottom:var(--name-floor, calc(56px + env(safe-area-inset-bottom, 0px))) !important; background:#14120f; opacity:1; }
 /* 選ぶ時も上の帯で送る。左右を替えた操作にも札を重ねない。 */
 html.touch #hud #battle-notices.choosing {
  left:calc(176px + env(safe-area-inset-left, 0px)); top:calc(60px + env(safe-area-inset-top, 0px)); bottom:auto;
  width:min(280px, calc(100vw - 552px - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px)));
  max-height:calc(45vh - 60px - env(safe-area-inset-top, 0px)); padding:4px;
 }
 html.touch.tc-sw #hud #battle-notices.choosing { left:calc(368px + env(safe-area-inset-left, 0px)); }
 html.touch #hud #battle-notices.choosing #choice { min-height:44px; }
 html.touch #hud #battle-notices.choosing #objectives:not(.expand) li.cur small { display:none !important; }
}
`;
    style.textContent += `
#hud :is(#battle-notices,#choice-tasks) #objectives:not(.expand) li:not(.cur), #hud #objectives:not(.expand) #battle-log-entry { display:none !important; }
#hud #objectives:not(.expand) { min-height:44px; }
#hud #objectives.goal-changed { outline:2px solid #f3d98a; outline-offset:-2px; }
#hud #objectives.goal-changed li.cur { color:#fff3d0; }
#hud .mk.main { width:max-content; max-width:min(260px, 30vw); white-space:normal; }
#hud .mk { width:max-content; }
#hud .mk.main b { min-width:0; overflow-wrap:anywhere; }
#hud .mk.main small { white-space:normal; }
#hud #battle-notices:not(.choosing) #objectives:not(.expand) li.cur small.goal-place { display:block !important; font-size:max(12px, calc(12px * var(--text-scale, 1))); }
#hud :is(#battle-notices,#choice-tasks) #objectives:not(.expand) li.cur .tag { display:none !important; }
#hud :is(#battle-notices,#choice-tasks) #objectives.expand li.more { display:none !important; }
#hud #battle-notices:not(.choosing) #objectives.expand { max-height:28vh; overflow-y:auto; }
`;
    style.textContent += `
#hud #objectives:not(.expand) .obj-full, #hud #objectives.expand .obj-now { display:none; }
`;
    document.head.appendChild(style);
    // 名前・体力の札が伸びた時と画面の向きが変わった時だけ、知らせの下端を測る。
    const nameCard = this.root.querySelector('.bl');
    this.floorObserver = new ResizeObserver(() => {
      if (!this.root.clientHeight || !nameCard.offsetHeight) return;
      const floor = this.root.clientHeight - nameCard.offsetTop + 8;
      this.rail.style.setProperty('--notice-floor', `${floor}px`);
      this.root.style.setProperty('--name-floor', `${floor}px`);
    });
    this.floorObserver.observe(nameCard);
    this.floorObserver.observe(this.root);
    this.rail.addEventListener('scroll', () => this.choiceMore(), { passive:true });
    window.addEventListener('resize', () => { this.fitChoice(); this.sync(); });
    this.sync();
  }

  // 札が高い時は説明の字を少し小さくする。測るのは札の書き換えと画面の大きさが変わった時だけ。
  choiceMore() {
    const rail = this.rail;
    rail.classList.remove('has-more');
    rail.classList.toggle('has-more', !this.sources[0].el.hidden && rail.scrollHeight - rail.clientHeight - rail.scrollTop > 12);
  }

  rememberWarning(item) {
    if (item.kind !== 'warn' || item.priority < 100 || item.recorded) return;
    item.recorded = true;
    const log = this.hud.warningLog || (this.hud.warningLog = []);
    if (log.some((line) => line.text === item.text)) return;
    log.push({ text:item.text, t:Math.floor(this.hud.rt?.t || 0) });
    if (log.length > 30) log.shift();
  }

  fitChoice() {
    const el = this.sources[0].el;
    if (el.hidden) return;
    el.classList.remove('compact');
    if (el.scrollHeight > el.clientHeight) el.classList.add('compact');
    this.choiceMore();
  }

  reset() {
    this.queue.length = 0; this.seen.clear(); this.clock = 0; this.reasonScan = 0;
    this.hud.rt?._reasonSeen?.clear();
    for (const el of this.cards) { el.hidden = true; el._notice = null; }
    this.sync();
  }

  // 話し手や出し方を問わず、同じ文は実際に出してから三十秒あける。
  // 待たせる物は記録せずに調べ、出す時にもう一度調べて記録する。
  key(text) {
    // 表示する原文は変えず、話し手・数字・空白・句読点の違いだけ束ねる。
    return String(text).trim().replace(/^[^「\n]{1,30}「([\s\S]+)」$/, '$1')
      .replace(/[0-9０-９]+(?:[.．][0-9０-９]+)?/g, '数')
      .replace(/[\s、。！!？?]+/g, '');
  }

  repeatOk(text, remember = false) {
    // 同じ用向きは解消まで一度。ほかの同文も出し方をまたいで間をあける。
    if (!String(text ?? '').trim() || /^[0０]+$/.test(String(text).trim())) return false;
    // 空白・句読点だけの札と、何が起きたか分からない武器名だけの札は出さない。
    const key = this.key(text);
    if (!key || /^(?:(?:前|正面|後ろ|左|右)から)?(?:槍|刀|矢|鉄砲|一撃)$/.test(key)) return false;
    const rt = this.hud.rt, reason = noticeReason(String(text));
    if (reason === 'proof' && !headNoticeAllowed(rt)) return false;
    if (reason && rt) {
      const seen = rt._reasonSeen || (rt._reasonSeen = new Set());
      if (seen.has(reason)) return false;
    }
    text = key;
    const gap = Math.max(30, this.hud.rt?.world?.def.noticeRepeatGap || 8);
    if (this.clock - (this.seen.get(text) ?? -Infinity) < gap) return false;
    if (remember) {
      this.seen.set(text, this.clock);
      if (reason && rt) rt._reasonSeen.add(reason);
    }
    return true;
  }

  push(text, priority, seconds = 3, kind = '', valid = null) {
    text = String(text ?? '').trim();
    if (!this.repeatOk(text)) return;
    if (priority >= 75 && kind !== 'task' && kind !== 'warn') {
      const log = this.hud.resultNotices || (this.hud.resultNotices = []);
      if (!log.some((line) => line.text === text)) {
        log.push({ text, t:Math.floor(this.hud.rt?.t || 0) });
        if (log.length > 60) log.shift();
      }
    }
    const key = this.key(text);
    if (this.queue.some((item) => item.key === key)) return;
    // 古い任務の書き換えは持ち越さない。
    if (kind === 'task') for (let i = this.queue.length - 1; i >= 0; i--) if (this.queue[i].kind === kind) this.queue.splice(i, 1);
    this.queue.push({ text, key, priority, left:Math.max(seconds, Math.min(10, 1.2 + text.length * 0.1)), born:this.clock, kind, valid, selected:false });
    // 大事な知らせを残し、同じ優先度なら古い物から記録へ回す。
    if (this.queue.length > 3) {
      let drop = 0;
      for (let i = 1; i < this.queue.length; i++) if (this.queue[i].priority < this.queue[drop].priority) drop = i;
      this.rememberWarning(this.queue[drop]);
      this.queue.splice(drop, 1);
    }
    this.sync();
  }

  visible(id) {
    for (const source of this.sources) if (source.id === id) return source.selected;
    return false;
  }

  room(priority) {
    let count = 0;
    for (const source of this.sources) if (source.selected && source.priority >= priority) count++;
    for (const item of this.queue) if (item.selected && item.priority >= priority) {
      // 台詞を待ち列から出すのは、共通の枠が使える時だけ。
      if (priority === 70) return false;
      count++;
    }
    return count < this.limit;
  }

  update(dt) {
    this.clock += dt;
    if (this.clock >= (this.reasonScan || 0)) {
      this.reasonScan = this.clock + 0.5;
      refreshNoticeReasons(this.hud.rt);
    }
    for (let i = this.queue.length - 1; i >= 0; i--) {
      const item = this.queue[i];
      if (item.selected) item.left -= dt;
      if (item.left <= 0 || this.clock - item.born > (item.priority >= 75 ? 60 : 12)) { this.rememberWarning(item); this.queue.splice(i, 1); }
    }
    // 重複除けの覚え書きも無限に増やさない。
    if (this.seen.size > 80) {
      const gap = Math.max(30, this.hud.rt?.world?.def.noticeRepeatGap || 8);
      for (const [text, time] of this.seen) if (this.clock - time >= gap) this.seen.delete(text);
    }
    this.sync();
  }

  pick(source) {
    const picks = this.picks;
    const message = !source.el || source.id === 'subtitle';
    if (message) for (let i = 0; i < picks.length; i++) {
      const old = picks[i];
      if (old.el && old.id !== 'subtitle') continue;
      // 一枠には一つ。同じ重要さなら新しい物を残す。
      if (old.priority > source.priority || old.priority === source.priority && (old.born || 0) > (source.born || 0)) return;
      picks.splice(i, 1); break;
    }
    let at = 0;
    while (at < picks.length && picks[at].priority >= source.priority) at++;
    if (at < this.limit) {
      for (let i = Math.min(picks.length, this.limit - 1); i > at; i--) picks[i] = picks[i - 1];
      picks[at] = source;
    }
  }

  sync() {
    this.picks.length = 0;
    const intro = !document.getElementById('intro').hidden;
    const choosing = !document.getElementById('choice').hidden;
    const phone = this.shortScreen.matches && document.documentElement.classList.contains('touch');
    this.rail.classList.toggle('choosing', choosing);
    const taskParent = choosing && !phone ? this.taskDock : this.rail;
    if (this.sources[1].el.parentNode !== taskParent) {
      taskParent.appendChild(this.sources[1].el);
    }
    this.taskDock.hidden = !choosing || phone;
    // 横向きの携帯では記録の入口を上の操作帯へ置く。歩く指の範囲を空ける。
    const logEntry = this.hud.logEntry, logParent = phone ? this.root : this.sources[1].el;
    if (logEntry && logEntry.parentNode !== logParent) {
      logParent.appendChild(logEntry);
      this.hud.rectsT = 0;
    }
    this.limit = phone || (!choosing && (this.shortScreen.matches || this.sources[1].el.classList.contains('expand'))) ? 2 : 3;
    if (!choosing && this.hud.rt?.def.noticeLimit) this.limit = Math.min(this.limit, this.hud.rt.def.noticeLimit);
    for (const source of this.sources) {
      source.selected = false;
      const el = source.el;
      const active = source.id === 'banner' ? this.hud.bannerT > 0 : source.id === 'subtitle' ? this.hud.subT > 0 && !!el.textContent.trim() : source.id === 'objectives' ? !this.hud.rt?.over && ((!!el.querySelector('li') && !this.root.classList.contains('no-objectives')) || (logEntry && !logEntry.hidden)) : !el.hidden;
      // 任務が台詞の後から出た時も、同文の二枚目は隠す。
      if (source.id === 'subtitle' && this.hud.shownLine && this.hud.taskRepeats(this.hud.shownLine.speaker, this.hud.shownLine.text)) continue;
      // 箕作城では門の打ち方を先に見せ、首や歩き方の札を重ねない。
      const gateFirst = this.hud.rt?.def.noticeLimit && this.hud.rt?._gg?.objOn;
      if (active && !(gateFirst && source.id === 'tutorial') && !intro && (!choosing || source.id === 'choice' || source.id === 'objectives')) this.pick(source);
    }
    for (let i = 0; i < this.queue.length; i++) {
      const item = this.queue[i]; item.selected = false;
      if ((item.valid && !item.valid()) || (item.kind === 'warn' && !item.shown && this.clock - item.born > 3)) { this.rememberWarning(item); this.queue.splice(i--, 1); continue; }
      if (!item.shown && !this.repeatOk(item.text)) { this.queue.splice(i--, 1); continue; }
      if (!intro && (!choosing || item.kind === 'task' || item.priority >= 110)) this.pick(item);
    }
    let card = 0;
    this.message.hidden = true;
    for (let i = 0; i < this.picks.length; i++) {
      const item = this.picks[i]; item.selected = true;
      if (item.el) {
        item.el.style.order = i;
        if (item.id === 'subtitle') { this.message.hidden = false; this.message.style.order = i; }
      }
      else {
        if (!item.shown) { this.repeatOk(item.text, true); item.shown = true; }
        const el = this.cards[card++];
        const parent = this.message;
        if (el.parentNode !== parent) parent.appendChild(el);
        // 任務が同じ欄に見えている時は、長い任務文を二枚に重ねない。
        // 任務が隠れている時と選択中は、知らせだけでも全文を読めるようにする。
        const text = item.kind === 'task' && !choosing && this.sources[1].selected
          ? '任務が変わった。今の任務を確かめよ' : item.text;
        if (el._notice !== item || el.textContent !== text) {
          el.textContent = text; el.setAttribute('aria-label', item.text);
          el.className = 'battle-notice' + (item.kind === 'warn' ? ' warn' : ''); el._notice = item;
        }
        this.message.hidden = false; this.message.style.order = i;
        el.style.order = i; el.hidden = false;
      }
    }
    for (; card < this.cards.length; card++) this.cards[card].hidden = true;
    for (const source of this.sources) source.el.classList.toggle('notice-muted', !source.selected);
    // 既に見せた古い札を、後から再び出さない。台詞は会話の記録に残る。
    for (let i = this.queue.length - 1; i >= 0; i--) {
      const item = this.queue[i];
      if (item.shown && !item.selected && !intro && !choosing) { this.rememberWarning(item); this.queue.splice(i, 1); }
    }
    if (card && !intro && !choosing && this.lastPicks.includes(this.sources[3]) && !this.sources[3].selected) {
      this.hud.subT = 0;
      window.speechSynthesis?.cancel();
    }
    for (let i = 0; i < 3; i++) {
      const item = this.picks[i] || null;
      if (this.lastPicks[i] !== item) { this.lastPicks[i] = item; this.hud.rectsT = 0; }
    }
    if (this.choosing !== choosing) { this.choosing = choosing; this.hud.rectsT = 0; }
    const choiceHead = this.sources[0].el.firstElementChild;
    if (choosing && this.choiceHead !== choiceHead) { this.choiceHead = choiceHead; this.fitChoice(); }
    if (!choosing) { this.choiceHead = null; this.rail.classList.remove('has-more'); }
  }
}
