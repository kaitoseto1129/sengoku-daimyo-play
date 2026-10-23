import { retreatRequired, rescueTarget } from './battle_danger.js';
import { noticeReason, refreshNoticeReasons, headNoticeAllowed } from './notice_source.js';
// 並びが同じなら書き直さない。札の選び直しでも表示を一度消してから戻さない。
function setOrder(el, order) { const value = String(order); if (el.style.order !== value) el.style.order = value; }
function setHidden(el, hidden) { if (el.hidden !== hidden) el.hidden = hidden; }
// 戦の知らせを三枠にまとめる。札と待ち列は使い回し、毎コマ作らない。
export class BattleNotices {
  constructor(hud) {
    this.hud = hud;
    this.root = hud.root;
    this.rail = document.createElement('div');
    this.rail.id = 'battle-notices';
    this.root.appendChild(this.rail);
    this.sources = [];
    for (const [id, priority] of [['choice', 120], ['objectives', 90], ['banner', 80], ['subtitle', 70], ['tutorial', 10], ['situation', 55], ['skiphint', 60]]) {
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
    this.free = [];
    for (let i = 0; i < 12; i++) this.free.push({});
    this.displayed = new Map();
    this.seen = new Map();
    this.accepted = new Map();
    this.picks = [];
    this.lastPicks = [null, null, null];
    this.limit = 3;
    this.shortScreen = window.matchMedia('(max-height:500px)');
    this.clock = 0;
    const style = document.createElement('style');
    style.textContent = `
/* 接敵中の細かな数字は、地図や号令を開いた時に読む。 */
html.touch body #hud.combat-three :is(.tr,.tl,#armybar,#compass,#boss,#target,#h-squad,#h-units,#sonae-cards,#yasen-hud,#siegecards) { display:none !important; }
#hud #battle-notices { position:absolute; left:calc(76px + env(safe-area-inset-left, 0px)); top:calc(96px + env(safe-area-inset-top, 0px)); width:min(320px, 32%); max-height:calc(100% - 196px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)); display:flex; flex-direction:column; gap:8px; overflow-y:auto; overscroll-behavior:contain; touch-action:pan-y; pointer-events:auto; }
#hud #boss { left:calc(100px + min(320px, 32%) + env(safe-area-inset-left, 0px)); right:calc(216px + env(safe-area-inset-right, 0px)); width:auto; max-width:none; margin-top:0; transform:none; min-width:0; grid-template-columns:minmax(0, 1fr); text-align:center; }
#hud #boss span { min-width:0; width:100%; max-width:100%; overflow-wrap:anywhere; box-sizing:border-box; }
#hud #boss i { width:min(360px, 100%); box-sizing:border-box; }
#hud #battle-notices :is(#choice,#objectives,#banner,#subtitle,#tutorial,#situation,#skiphint,.battle-notice) { position:relative !important; inset:auto !important; transform:none !important; width:100% !important; min-width:0 !important; max-width:100% !important; margin:0 !important; box-sizing:border-box; font-size:max(12px, calc(14px * var(--text-scale, 1))) !important; line-height:1.45 !important; letter-spacing:0 !important; padding:6px 10px !important; background:rgba(12,10,8,.9) !important; text-align:left; visibility:visible !important; opacity:1 !important; animation:none !important; flex:0 0 auto; }
/* 札を移した後も元の横並び・固定高を持ち越さず、本文の幅で折り返す。 */
html body #hud #battle-notices:not(.choosing) > :is(#objectives,#battle-message,#tutorial,#banner,#situation,#skiphint) {
 display:block; position:relative !important; inset:auto !important; transform:none !important;
 width:100% !important; min-width:0 !important; height:auto !important; min-height:0; max-height:none !important; flex:0 0 auto;
 writing-mode:horizontal-tb; white-space:normal; overflow-wrap:anywhere;
}
html body #hud #battle-notices #tutorial :is(.what,.how,.lbl) {
 width:auto !important; min-width:0; max-width:100%; height:auto !important; white-space:normal; word-break:normal; writing-mode:horizontal-tb;
}
@media (min-height:501px) {
 /* 姉川の任務と警告を地図から離し、二行の本文まで札の中に収める。 */
 html body #hud.anegawa-notices #battle-notices:not(.choosing) {
  left:20px !important; right:auto !important; top:104px !important;
  width:min(304px,30vw) !important; max-height:calc(100% - 304px); gap:8px;
 }
 #hud.anegawa-notices #battle-notices #tutorial.coach,
 #hud.anegawa-notices #battle-notices #tutorial.coach .what {
  height:auto !important; min-height:0; max-height:none !important; overflow:visible;
 }
 html body #hud.tano-notices #battle-notices:not(.choosing) {
  left:16px !important; right:auto !important; top:104px !important; width:min(288px,30vw) !important; max-height:calc(100% - 304px); gap:6px;
 }
}
#hud #battle-notices [hidden], #hud #battle-notices .notice-muted { display:none !important; }
/* 姉川の現在の下知は、古い札の薄い文字色を引き継がない。 */
html body #hud.anegawa-notices #battle-notices:not(.choosing) #objectives:not(.expand) #obj-list li.cur,
html body #hud.anegawa-notices #battle-notices:not(.choosing) #objectives:not(.expand) :is(.obj-now,.battle-action) {
 color:#fff3df !important; opacity:1 !important;
 text-shadow:0 1px 2px #000;
}
#hud #battle-notices :is(#subtitle,#situation,#skiphint,.battle-notice):empty { display:none !important; }
#hud.ending #battle-notices #objectives { display:none !important; }
#hud #battle-message { display:flex; flex-direction:column; gap:8px; flex:0 0 auto; min-width:0; width:100%; }
#hud #objectives #battle-log-entry { min-height:44px; margin-top:8px; padding:4px 0; border-width:0 0 1px; text-align:left; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-size:max(12px, calc(12px * var(--text-scale, 1))); }
/* 一行の任務でも、一覧を開く押し場は携帯の指が収まる高さを保つ。 */
#hud #objectives #obj-list { min-width:44px; min-height:44px; box-sizing:border-box; padding:9px 0; margin:0; }
#hud #objectives #obj-list + .battle-action:not([hidden]) { margin-top:8px; }
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
 /* 姉川の報せは意味まで読める幅にし、四十四画素の押す高さを保つ。 */
 html.touch #hud.anegawa-notices > #battle-log-entry { width:auto !important; min-width:80px; }
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
/* 方位の帯の下端（92px）から間を空け、敵将の札の場所を確保する。 */
#hud #boss { top:calc(104px + env(safe-area-inset-top, 0px)); bottom:auto; right:calc(294px + env(safe-area-inset-right, 0px)); }
html[data-text-size=l] #hud #battle-notices:not(.choosing) { width:min(380px, 32vw); }
@media (max-height:500px) {
 /* 方位の帯の下、知らせと右上の地図の間。後の指定で上端へ戻さない。 */
 #hud #boss { top:calc(104px + env(safe-area-inset-top, 0px)); right:calc(230px + env(safe-area-inset-right, 0px)); display:flex; flex-wrap:wrap; justify-content:center; align-items:center; gap:4px 12px; }
 #hud #boss span { width:auto; }
 html.touch.tc-low #hud #boss { left:calc(40px + min(224px, 28vw) + env(safe-area-inset-left, 0px)); }
 html[data-text-size=l] #hud #boss, html.touch.tc-low[data-text-size=l] #hud #boss { left:calc(40px + min(380px, 32vw) + env(safe-area-inset-left, 0px)); }
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
 /* 倒れた理由は下知の補足と違い、終幕の札の中に残す。 */
 #hud #battle-notices:not(.choosing) #banner.down-reason small { display:block !important; line-height:1.6; }
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
 /* 任務は歩き始める半分の外へ。上の帯で小地図と右下の丸も避ける。 */
 html.touch #hud #battle-notices:not(.choosing),
 html.touch.tc-low #hud #battle-notices:not(.choosing) {
  --notice-top:60px;
  left:calc(50vw + 8px + env(safe-area-inset-left, 0px));
  top:calc(var(--notice-top) + env(safe-area-inset-top, 0px));
  bottom:auto;
  width:min(280px, calc(50vw - 104px - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px)));
  padding:4px;
  gap:8px;
  /* 普段は高さの四分の一ほどに畳む。長い文は欄を送り、戦場の中央を空ける。 */
  max-height:min(25vh, calc(100% - var(--notice-top) - env(safe-area-inset-top, 0px) - max(96px, var(--notice-floor, calc(96px + env(safe-area-inset-bottom, 0px))))));
  pointer-events:none;
 }
 /* 任務を自分で開いた時だけ広げる。名前札との間は8px空けたままにする。 */
 html.touch #hud #battle-notices:not(.choosing):has(#objectives.expand),
 html.touch.tc-low #hud #battle-notices:not(.choosing):has(#objectives.expand) {
  max-height:min(25vh, calc(100% - var(--notice-top) - env(safe-area-inset-top, 0px) - max(96px, var(--notice-floor, calc(96px + env(safe-area-inset-bottom, 0px))))));
 }
 html.touch #hud #battle-message { gap:4px; }
 html.touch.tc-sw #hud #battle-notices:not(.choosing) {
  left:calc(104px + env(safe-area-inset-left, 0px)); right:auto;
  width:min(280px, calc(50vw - 112px - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px)));
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
  top:calc(104px + env(safe-area-inset-top, 0px)); margin-top:0; padding:4px 8px;
  font-size:max(12px, calc(12px * var(--text-scale, 1))); background:#14120f; color:#ece4d2;
 }
 html.touch #hud #boss span { font-size:inherit; }
 html.touch #hud #boss i { height:4px; }
 html.touch #hud > #battle-log-entry {
  position:absolute !important; left:calc(176px + env(safe-area-inset-left, 0px)) !important;
  top:calc(8px + env(safe-area-inset-top, 0px)) !important; width:44px !important;
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
#hud .mk, #hud .mk.main:has(b) { width:max-content; min-width:max-content; max-width:none; white-space:nowrap; }
#hud .mk.main.edge:has(b) { width:max-content; height:auto; }
#hud #markers .mk :is(b,small,.behind-label) { min-width:max-content; white-space:nowrap; overflow-wrap:normal; }
#hud #battle-notices:not(.choosing) #objectives:not(.expand) li.cur small.goal-place { display:block !important; font-size:max(12px, calc(12px * var(--text-scale, 1))); }
/* 指で焚く篝火と集合待ちの理由は、指定した戦だけ携帯でも残す。 */
#hud #battle-notices:not(.choosing) #objectives.task-details:not(.expand) li.cur small:not(.goal-place) { display:block !important; font-size:max(12px, calc(13px * var(--text-scale, 1))); line-height:1.4; }
#hud :is(#battle-notices,#choice-tasks) #objectives:not(.expand) li.cur .tag { display:none !important; }
#hud :is(#battle-notices,#choice-tasks) #objectives.expand li.more { display:none !important; }
#hud #battle-notices:not(.choosing) #objectives.expand { max-height:28vh; overflow-y:auto; }
`;
    style.textContent += `
#hud #objectives:not(.expand) .obj-full, #hud #objectives.expand .obj-now { display:none !important; }
/* 短い指図と全文を重ねず、一行ずつ通常の流れで読む。 */
#hud :is(#battle-notices,#choice-tasks) #objectives:not(.expand) li.cur .obj-now {
 display:block; position:static; letter-spacing:normal; text-shadow:none; line-height:1.4;
}
/* 「今」と本文の一行目を横に並べ、補足は次の行へ送る。 */
#hud :is(#battle-notices,#choice-tasks) #objectives:not(.expand) li.cur {
 display:flex !important; flex-wrap:wrap; align-items:baseline;
}
#hud :is(#battle-notices,#choice-tasks) #objectives:not(.expand) li.cur::before { flex:0 0 auto; white-space:nowrap; }
#hud :is(#battle-notices,#choice-tasks) #objectives:not(.expand) li.cur .obj-text { flex:1 1 0; min-width:0; white-space:normal; overflow-wrap:anywhere; overflow:visible; }
#hud :is(#battle-notices,#choice-tasks) #objectives li.cur small { flex-basis:100%; }
/* 心得は共通の指定で格子に戻る。畳んだ札では隠した種別の列を残さず、
   本文と補足に札の全幅を渡す。一字ずつ折れて黒い縦長の札になるのを防ぐ。 */
#hud :is(#battle-notices,#choice-tasks) #objectives:not(.expand) #obj-list li {
 grid-template-columns:minmax(0, 1fr);
}
#hud :is(#battle-notices,#choice-tasks) #objectives:not(.expand) #obj-list li > :is(.obj-text,small,.opb) {
 grid-column:1 / -1;
}
/* 行き先と距離は一行のまま。長い時はこの行だけ左右に送れる。 */
#hud #battle-notices #objectives li.cur small.goal-place {
 min-width:0; white-space:nowrap; overflow-wrap:normal; overflow-x:auto; touch-action:pan-x;
}
@media (max-height:500px) {
 /* 警告が二行でも、今の任務と行き先を欄の先頭で読めるようにする。 */
 html.touch #hud #battle-notices:not(.choosing) #objectives { order:-1 !important; }
 /* 元の携帯字幕の左右指定より強く、共通欄の幅で折り返す。 */
 html.touch #hud #battle-notices #battle-message #subtitle {
  position:relative !important; inset:auto !important; transform:none !important;
  width:100% !important; max-width:100% !important; margin:0 !important;
  white-space:normal; overflow-wrap:anywhere; text-overflow:clip; overflow:visible;
  pointer-events:auto !important;
 }
 html.touch #hud #battle-notices #subtitle .sp { display:inline; margin:0 .5em 0 0; }
 html.touch #hud #battle-notices #objectives:not(.expand) li.cur { min-height:0; }
 html.touch #hud #battle-notices { overflow-x:hidden; }
 html.touch #hud > #battle-log-entry { min-width:44px; min-height:44px; white-space:nowrap; }
}
`;
    style.textContent += `
#hud.mission-visible.no-objectives #objectives #obj-list { display:none !important; }
#hud.mission-visible :is(#battle-notices,#choice-tasks) #objectives:not([hidden]):not(.notice-muted) { display:block !important; visibility:visible !important; opacity:1 !important; }
#hud :is(#battle-notices,#choice-tasks) #objectives .victory-condition:not([hidden]) { display:block !important; font-size:max(12px, calc(12px * var(--text-scale, 1))); line-height:1.4; color:#ece4d2; margin-bottom:4px; }
`;
    style.textContent += `
html.touch #hud > #battle-log-entry { width:auto !important; min-width:80px; min-height:44px; }
`;
    // 墨俣は二つの札を横に並べ、任務は選び終えるまで畳む。
    style.textContent += `
@media (min-width:601px) and (max-width:1000px) and (max-height:500px) {
 /* 田野の名札は任務と反対の半分へ。狭い欄の上に重ねず、左右を替えた操作にも合わせる。 */
 html.touch.tc-low #hud.tano-notices #boss,
 html.touch.tc-low[data-text-size=l] #hud.tano-notices #boss {
  left:calc(236px + env(safe-area-inset-left, 0px));
  right:calc(50vw + 8px + env(safe-area-inset-right, 0px));
  top:calc(64px + env(safe-area-inset-top, 0px));
  font-size:max(12px, calc(13px * var(--text-scale, 1))); letter-spacing:0; line-height:1.4;
 }
 html.touch.tc-low.tc-sw #hud.tano-notices #boss,
 html.touch.tc-low.tc-sw[data-text-size=l] #hud.tano-notices #boss {
  left:calc(50vw + 16px + env(safe-area-inset-left, 0px));
  right:calc(104px + env(safe-area-inset-right, 0px));
 }
 /* 「報せ二件」の文字数に合う幅。押せる高さは四十四のまま保つ。 */
 html.touch #hud.tano-notices > #battle-log-entry {
  width:auto !important; min-width:88px; padding:4px 8px; letter-spacing:0; text-align:center;
 }
}
@media (max-height:500px) {
 /* 田野と姉川は任務と警告の二枚を読み切れる高さにする。下の操作帯は空ける。 */
 html.touch #hud.tano-notices #battle-notices:not(.choosing),
 html.touch.tc-low #hud.tano-notices #battle-notices:not(.choosing),
 html.touch #hud.anegawa-notices #battle-notices:not(.choosing),
 html.touch.tc-low #hud.anegawa-notices #battle-notices:not(.choosing),
 html.touch #hud.shitaragahara #battle-notices:not(.choosing),
 html.touch.tc-low #hud.shitaragahara #battle-notices:not(.choosing) {
  max-height:min(40vh, calc(100% - var(--notice-top) - env(safe-area-inset-top, 0px) - max(96px, var(--notice-floor, calc(96px + env(safe-area-inset-bottom, 0px))))));
 }
 /* 手がかりの本文を札の高さに含める。任務と二枚でも下の行を切らない。 */
 #hud.shitaragahara #battle-notices #tutorial.coach,
 #hud.anegawa-notices #battle-notices #tutorial.coach,
 #hud.tano-notices #battle-notices #tutorial.coach { height:auto !important; min-height:min-content; max-height:none !important; overflow:visible !important; flex:0 0 auto; }
 #hud.shitaragahara #battle-notices #tutorial.coach .what,
 #hud.anegawa-notices #battle-notices #tutorial.coach .what,
 #hud.tano-notices #battle-notices #tutorial.coach .what { white-space:normal; overflow-wrap:anywhere; max-height:none; overflow:visible; }
}
#hud.suno-choice #battle-notices.choosing {
 left:calc(16px + env(safe-area-inset-left, 0px)) !important; right:calc(16px + env(safe-area-inset-right, 0px)) !important;
 top:calc(60px + env(safe-area-inset-top, 0px)) !important; bottom:auto !important;
 width:auto !important; max-width:740px; margin-inline:auto; padding:4px; max-height:34vh !important;
}
#hud.suno-choice #battle-notices #choice { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); column-gap:8px; overflow:visible; }
#hud.suno-choice #battle-notices #choice :is(h5,.choice-help,#choice-seconds,.tm) { grid-column:1 / -1; }
#hud.suno-choice #battle-notices #choice .opt { margin-top:0; font-size:max(12px, calc(15px * var(--text-scale, 1))); }
#hud.suno-choice #battle-notices #choice .opt small { white-space:nowrap; overflow-wrap:normal; }
#hud.suno-choice #choice-tasks, #hud.suno-choice #battle-message, #hud.suno-choice #battle-notices #objectives { display:none !important; }
@media (max-width:600px) {
 #hud.suno-choice #battle-notices #choice { grid-template-columns:minmax(0,1fr); }
 #hud.suno-choice #battle-notices #choice .opt + .opt { margin-top:8px; }
 #hud.suno-choice #battle-notices.choosing { max-height:45vh !important; }
}
/* 志賀の退き口は二つの筋を並べ、救出の札まで最初から読めるようにする。 */
@media (min-width:601px) and (max-height:500px) {
 #hud.shiga-choice #battle-notices.choosing {
  left:calc(16px + env(safe-area-inset-left, 0px)) !important; right:calc(16px + env(safe-area-inset-right, 0px)) !important;
  transform:none !important;
  top:calc(56px + env(safe-area-inset-top, 0px)) !important; bottom:auto !important;
  width:auto !important; max-width:740px; margin-inline:auto; max-height:calc(100% - 152px) !important;
 }
 #hud.shiga-choice #battle-notices #choice { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); gap:4px 8px; overflow:visible; }
 #hud.shiga-choice #battle-notices #choice :is(h5,.choice-help,#choice-seconds,.tm) { grid-column:1 / -1; margin:0; }
 #hud.shiga-choice #battle-notices #choice .opt { margin-top:4px; min-height:48px; border:1px solid var(--gold-line); padding:4px 8px; font-size:max(15px, calc(15px * var(--text-scale, 1))); }
 #hud.shiga-choice #choice-tasks, #hud.shiga-choice #battle-message, #hud.shiga-choice #battle-notices #objectives { display:none !important; }
}
`;
    // 携帯では字幕と読むだけの知らせで歩く指を止めない。全文は任務欄の記録から読む。
    style.textContent += `
/* 字幕を通した指が親の余白で止まらないようにする。選択中・任務一覧は送れる。 */
html.touch body #hud #battle-notices:not(.choosing):not(:has(#objectives.expand)) {
 pointer-events:none !important;
}
html.touch #hud #battle-notices #battle-message,
html.touch #hud #battle-notices #battle-message :is(#subtitle,.battle-notice),
html.touch #hud #battle-notices #battle-message :is(#subtitle,.battle-notice) * {
 pointer-events:none !important;
}
html.touch #hud #battle-notices #battle-message #subtitle { cursor:default; }
/* 普段は今の一件だけ。詳しい下知と記録は任務を押して読む。 */
#hud :is(#battle-notices,#choice-tasks) #objectives:not(.expand) .victory-condition { display:none !important; }
@media (max-height:500px) {
 html.touch #hud #battle-notices:not(.choosing) #objectives:not(.expand) li.cur small { display:none !important; }
 html.touch #hud #battle-notices #objectives:not(.expand) li.cur { font-size:max(20px, calc(20px * var(--text-scale, 1))) !important; font-weight:900; line-height:1.4; }
 html.touch #hud #battle-notices :is(#tutorial,#subtitle,.battle-notice) { font-size:max(15px, calc(15px * var(--text-scale, 1))) !important; }
 html body #hud #battle-notices .battle-notice.warn { font-size:max(20px, calc(20px * var(--text-scale, 1))) !important; line-height:1.4 !important; }
 html.touch #hud #markers .mk.main b { font-size:max(16px, calc(16px * var(--text-scale, 1))); }
 html.touch #hud #battle-notices:not(.choosing) { max-height:min(30vh, calc(100% - var(--notice-top, 64px) - var(--notice-floor, 96px))); }
}
`;
    style.textContent += `
/* 横向きは今の行動一つを大きく。詳しい条件は自分で任務を開いた時に読む。 */
#hud .battle-action { font-weight:900; font-size:max(22px, calc(22px * var(--text-scale, 1))); line-height:1.4; color:#fff3d0; }
#hud #objectives.expand .battle-action { display:none !important; }
#hud.compact-battle :is(#battle-notices,#choice-tasks) #objectives:not(.expand) .victory-condition,
html body #hud.compact-battle #battle-notices:not(.choosing) #objectives:not(.expand) li.cur small,
#hud.compact-battle #objectives.has-action:not(.expand) #obj-list { display:none !important; }
/* 指定した守備戦だけ、構えの案内と持ち場・残り時間を一枚に収める。 */
html body #hud.compact-battle #battle-notices #objectives.keep-combat-task.has-action:not(.attack-help):not(.expand) #obj-list { display:block !important; margin-top:4px; }
html body #hud.compact-battle #battle-notices:not(.choosing) #objectives.keep-combat-task:not(.expand) li.cur small { display:block !important; font-size:max(12px, calc(13px * var(--text-scale, 1))); line-height:1.4; }
html body #hud.compact-battle #battle-notices #objectives.keep-combat-task.has-action:not(.expand) li.cur,
html body #hud.compact-battle #battle-notices #objectives.keep-combat-task.has-action:not(.expand) li.cur .obj-now { font-size:max(15px, calc(15px * var(--text-scale, 1))) !important; line-height:1.4 !important; }
html body #hud.compact-battle #objectives.keep-combat-task.has-action .battle-action { font-size:max(16px, calc(16px * var(--text-scale, 1))); }
#hud.compact-battle :is(.combat-cue-label,.range-cue,#combo,#killmark,#h-units,#h-squad) { display:none !important; }
#hud.compact-battle #battle-notices #objectives li.cur {
 font-size:max(22px, calc(22px * var(--text-scale, 1))) !important; font-weight:900; line-height:1.4 !important;
}
#hud.compact-battle #battle-notices #objectives.expand li.cur { font-size:max(16px, calc(16px * var(--text-scale, 1))) !important; }
#hud.compact-battle #battle-notices :is(.battle-notice,#choice,#tutorial),
#hud.compact-battle #battle-notices #choice .opt { font-size:max(18px, calc(18px * var(--text-scale, 1))) !important; }
#hud.compact-battle #battle-notices:not(.choosing):not(:has(#objectives.expand)) {
 width:min(300px, 34vw) !important; max-height:25vh !important;
}
@media (min-height:501px) {
 /* 設楽原の下知と台詞は左へ置き、右上の地図と隊名を空ける。 */
 html:not(.touch) body #hud.shitaragahara #battle-notices:not(.choosing) {
  left:calc(16px + env(safe-area-inset-left, 0px)) !important;
  right:auto !important; top:104px !important;
 }
}
`;
    // 文が長くなっても札を縮めて重ねない。通常の流れで高さを取り、欄の中で送る。
    style.textContent += `
html body #hud #battle-notices > :is(#objectives,#battle-message) {
 position:relative!important; inset:auto!important; transform:none!important;
 flex:0 0 auto; min-width:0; height:auto!important; box-sizing:border-box;
}
html body #hud #battle-notices:not(.choosing) > #objectives.ground-order:not(.expand) {
 position:fixed!important; inset:auto!important;
 left:var(--ground-order-x)!important; top:var(--ground-order-y)!important;
 width:max-content!important; max-width:min(240px, 40vw)!important;
 min-height:44px!important; max-height:none!important; overflow:visible!important;
}
html body #hud #battle-notices #battle-message > :is(#subtitle,.battle-notice) {
 font-size:max(18px, calc(18px * var(--text-scale, 1)))!important;
 position:relative!important; inset:auto!important; transform:none!important;
 flex:0 0 auto; height:auto!important; min-width:0; box-sizing:border-box;
}
html body #hud #battle-notices #objectives li.cur :is(.obj-text,.obj-now) {
 min-width:0; white-space:normal!important; overflow-wrap:anywhere!important;
}

@media (max-height:500px) {
 html.touch body #hud #battle-notices #objectives:not(.expand) li.cur .obj-now,
 html.touch body #hud.compact-battle #battle-notices #objectives.keep-combat-task.has-action:not(.expand) li.cur .obj-now {
  font-size:max(20px, calc(20px * var(--text-scale, 1))) !important; line-height:1.4 !important;
 }
}

`;
    style.textContent += `
html body #hud #battle-notices #battle-message > .battle-notice,
html.touch body #hud #battle-notices #battle-message > .battle-notice.warn {
 font-size:max(12px, calc(15px * var(--text-scale, 1))) !important;
 color:#fff3df !important; background:#18140f !important;
}
/* 会話は十八画素を保ち、長い台詞は既存の分割と待ち列で収める。 */
html body #hud #battle-notices #battle-message > #subtitle {
 font-size:max(18px, calc(18px * var(--text-scale, 1))) !important;
 color:#fff3df !important; background:#18140f !important;
}
#hud #battle-notices #battle-message .notice-phrase { display:inline-block; white-space:nowrap; }
`;
    // 知らせは上の三分の一に収める。長い判断はこの欄の中で送る。
    style.textContent += `
html body #hud #battle-notices,
html.touch body #hud #battle-notices,
html.touch.tc-low body #hud #battle-notices {
 top:calc(60px + env(safe-area-inset-top, 0px)) !important;
 bottom:auto !important; max-height:calc(100% / 3 - 60px - env(safe-area-inset-top, 0px)) !important;
 overflow-y:auto; gap:8px;
}
html body #hud #battle-notices:not(.choosing) > #objectives.ground-order:not(.expand) {
 position:fixed !important; inset:auto !important;
 left:var(--ground-order-x) !important; top:var(--ground-order-y) !important;
 width:max-content !important; max-width:min(240px, 30vw) !important;
}
/* 現地の札の中に旗を入れ、上の任務と地面の大旗に分けない。 */
html body #hud #battle-notices:not(.choosing) > #objectives.attached-destination:not(.expand) {
 padding-left:36px !important;
}
html body #hud #battle-notices:not(.choosing) > #objectives.attached-destination:not(.expand)::before {
 content:'⚑'; position:absolute; left:8px; top:50%; transform:translateY(-50%);
 font-size:26px; line-height:1; color:#fff3ba;
}
html body #hud #battle-message { gap:8px; }
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
    // 高さが変わった時だけ測る。古い台詞は記録へ残し、任務と警告を先に読む。
    this.messageObserver = new ResizeObserver(() => this.fitMessage());
    this.messageObserver.observe(this.rail);
    this.messageObserver.observe(this.message);
    this.messageObserver.observe(this.sources[1].el);
    // 同じ高さのまま文が入れ替わった時も整える。毎コマの幅の測定は避ける。
    this.textObserver = new MutationObserver(() => this.fitMessage());
    this.textObserver.observe(this.message, { childList:true, characterData:true, subtree:true });
    this.textObserver.observe(this.sources[1].el, { childList:true, characterData:true, subtree:true });
    this.rail.addEventListener('scroll', () => this.choiceMore(), { passive:true });
    window.addEventListener('resize', () => { this.fitChoice(); this.sync(); });
    this.sync();
  }

  // 高さが足りない時も文は捨てない。低い優先の札から待ち列へ戻す。
  fitMessage() {
    for (const el of this.message.children) {
      if (el.hidden || el.classList.contains('notice-muted') || !el.clientWidth) continue;
      this.fitText(el);
    }
    if (!this.rail.clientHeight) return;
    this.space = this.rail.clientHeight - 16;
    for (const item of this.picks) {
      const el = item.el || this.cards.find(card => card._notice === item);
      if (el?.parentNode === this.rail || el?.parentNode === this.message) item.height = el.offsetHeight;
    }
    let used = 0;
    for (let i = 0; i < this.picks.length; i++) {
      const item = this.picks[i];
      if (i && used + 8 + (item.height || 44) > this.space) {
        item.selected = false;
        if (item.el) item.el.classList.add('notice-muted');
        else for (const card of this.cards) if (card._notice === item) card.hidden = true;
        for (let j = 0; j < 3; j++) if (this.lastPicks[j] === item) this.lastPicks[j] = null;
        this.picks.splice(i--, 1);
        this.hud.rectsT = 0;
        continue;
      }
      used += (i ? 8 : 0) + (item.height || 44);
    }
    this.message.hidden = !this.sources[3].selected && !this.cards.some(card => !card.hidden && card.parentNode === this.message);
  }

  release(index) {
    const item = this.queue[index];
    this.rememberWarning(item);
    this.queue.splice(index, 1);
    for (let i = 0; i < 3; i++) if (this.lastPicks[i] === item) this.lastPicks[i] = null;
    item.valid = null;
    this.free.push(item);
  }

  displayText(item) {
    const treatment = (this.hud.rt?.def.key === 'moribe' || this.hud.rt?.def.key === 'mikatagahara' || this.hud.rt?.def.key === 'okehazama' || this.hud.rt?.def.key === 'honnoji' || this.hud.rt?.def.key === 'mitsukuri' || this.hud.rt?.def.key === 'tano' || this.hud.rt?.def.key === 'shitaragahara' || this.hud.rt?.def.key === 'tennoji' || this.hud.rt?.def.key === 'anegawa') && item.text.startsWith('血が止まらない');
    return treatment
      ? item.text.includes('使い切った') ? '出血。布がない。後ろへ退く' :
        this.hud.rt?.player.treatmentReady ? (this.hud.rt?.def.key === 'okehazama' ? '「手当て」を三秒長押し' : '止まって手当て') :
        this.hud.retreatGuide?.active && this.hud.retreatGuide.treatment && this.hud.retreatGuide.valid ? '十字の印へ。止まって手当て' : '味方の後ろへ下がろう'
      : item.kind === 'task' && this.sources[0].el.hidden && this.picks.includes(this.sources[1])
        ? '任務が変わった。今の任務を確かめよ' : item.text;
  }

  displayKey(item) {
    return item.el ? this.key(item.id === 'subtitle' ? this.hud.shownLine?.text || item.el.textContent : item.el.textContent) : this.key(this.displayText(item));
  }

  operationAdvice(text) {
    const def = this.hud.rt?.def;
    return def && def.key !== 'okehazama' && !def.town && !def.dojo &&
      /長押し|二本指|一本指|スワイプ|ドラッグ|タップ|釦|ボタン|指を|指で|押して|押そう|押すと/.test(text);
  }

  // 句読点を優先し、長い文節だけ語の境目で短くする。測定と作り直しは変更時だけ。
  fitText(el) {
    const text = el.textContent, width = el.clientWidth - 24;
    if (width <= 0 || el._fitText === text && el._fitWidth === width && el._fitScale === document.documentElement.dataset.textSize) return;
    el._fitText = text; el._fitWidth = width; el._fitScale = document.documentElement.dataset.textSize;
    this.measure ||= document.createElement('canvas').getContext('2d');
    const css = getComputedStyle(el);
    this.measure.font = `${css.fontWeight} ${css.fontSize} ${css.fontFamily}`;
    for (const span of el.querySelectorAll('.notice-phrase')) span.replaceWith(document.createTextNode(span.textContent));
    el.normalize();
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT), nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) {
      const fragment = document.createDocumentFragment();
      for (const clause of node.textContent.match(/[^、。　\n]+[、。　\n]*|[、。　\n]+/g) || []) {
        let line = '';
        const add = () => {
          const span = document.createElement('span'); span.className = 'notice-phrase'; span.textContent = line;
          const length = this.measure.measureText(line).width;
          if (length > width) span.style.fontSize = `${Math.max(12, parseFloat(css.fontSize) * width / length)}px`;
          fragment.appendChild(span); line = '';
        };
        // 活用語尾を一字だけ送らない。助詞の後で次の語が始まる所を短い文節にする。
        // 「下がろう」の「が」など、語中のひらがなは区切りにしない。
        if (this.measure.measureText(clause).width <= width) line = clause;
        else for (const phrase of clause.split(/(?<=[へをはにでとの])(?=[一-龯「『])/u)) {
          if (line && this.measure.measureText(line + phrase).width > width) add();
          line += phrase;
        }
        if (line) add();
      }
      node.replaceWith(fragment);
    }
  }

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
    while (this.queue.length) this.release(this.queue.length - 1);
    this.seen.clear(); this.accepted.clear(); this.displayed.clear(); this.clock = 0; this.reasonScan = 0;
    this.lastPicks.fill(null);
    for (const source of this.sources) { source.displayKey = null; source.height = 0; }
    this.adviceTimes = new Map();
    this.hud.okeThreatActive = false;
    this.sources[1].el.classList.remove('has-action');
    if (this.hud.actionLabel) this.hud.actionLabel.hidden = true;
    this.hud.rt?._reasonSeen?.clear();
    for (const el of this.cards) { el.hidden = true; el._notice = null; }
    this.sync();
  }

  // 話し手や出し方を問わず、同じ文は実際に出してから八秒以上あける。
  // 待たせる物は記録せずに調べ、出す時にもう一度調べて記録する。
  key(text) {
    // 表示する原文は変えず、話し手・数字・空白・句読点の違いだけ束ねる。
    return String(text).trim().replace(/^[^「\n]{1,30}「([\s\S]+)」$/, '$1')
      .replace(/[0-9０-９]+(?:[.．][0-9０-９]+)?/g, '数')
      .replace(/[\s、。！!？?]+/g, '');
  }

  repeatOk(text, remember = false) {
    // 同じ用向きは解消まで一度。ほかの同文も出し方をまたいで間をあける。
    if (this.operationAdvice(text)) return false;
    if (!String(text ?? '').trim() || /^[0０]+$/.test(String(text).trim())) return false;
    // 空白・句読点だけの札と、何が起きたか分からない武器名だけの札は出さない。
    const key = this.key(text);
    if (!key || /^(?:(?:前|正面|後ろ|左|右)から)?(?:槍|刀|矢|鉄砲|一撃)$/.test(key)) return false;
    // 長い台詞や、ほかの札で一時的に隠れた知らせも、表示が終わるまで積み直さない。
    // 出す時の記録は通す。表示開始からの待ち時間だけでは、読み終わる前に再掲できてしまう。
    if (!remember) {
      if (this.hud.subT > 0 && this.hud.shownLine?.key === key) return false;
      if (this.hud.bannerT > 0 && this.key(this.sources[2].el.textContent) === key) return false;
      if (this.queue.some((item) => item.shown && item.key === key)) return false;
    }
    const rt = this.hud.rt, reason = noticeReason(String(text));
    if (reason === 'proof' && !headNoticeAllowed(rt)) return false;
    if (reason && rt) {
      const seen = rt._reasonSeen || (rt._reasonSeen = new Set());
      if (seen.has(reason)) return false;
    }
    text = key;
    const gap = this.repeatGap();
    if (this.clock - (this.displayed.get(text) ?? -Infinity) < gap) return false;
    if (this.clock - (this.seen.get(text) ?? -Infinity) < gap) return false;
    if (remember) {
      this.seen.set(text, this.clock);
      if (reason && rt) rt._reasonSeen.add(reason);
    }
    return true;
  }

  push(text, priority, seconds = 3, kind = '', valid = null) {
    text = String(text ?? '').trim().replace(/^矢が来る！ 輪の外へ$/, '矢が来る！ ここへ にげる');
    const key = this.key(text);
    if (this.clock - (this.accepted.get(key) ?? -Infinity) < this.repeatGap()) return;
    if (!this.repeatOk(text)) return;
    if (priority >= 75 && kind !== 'task' && kind !== 'warn') {
      const log = this.hud.resultNotices || (this.hud.resultNotices = []);
      if (!log.some((line) => line.text === text)) {
        log.push({ text, t:Math.floor(this.hud.rt?.t || 0) });
        if (log.length > 60) log.shift();
      }
    }
    if (this.queue.some((item) => item.key === key)) return;
    // 古い任務の書き換えは持ち越さない。
    if (kind === 'task') for (let i = this.queue.length - 1; i >= 0; i--) if (this.queue[i].kind === kind) this.release(i);
    // 警告も優先順で待たせ、無効になった指示は表示前に外す。
    // 任務の全文は常設の札で読める。切り替えの知らせだけは二秒半で畳む。
    const duration = kind === 'task' ? 2.5 : Math.max(seconds, Math.min(10, 1.2 + text.length * 0.1));
    this.accepted.set(key, this.clock);
    if (!this.free.length) {
      let drop = -1;
      for (let i = 0; i < this.queue.length; i++) if (!this.queue[i].selected &&
          (drop < 0 || this.queue[i].priority < this.queue[drop].priority)) drop = i;
      if (drop < 0 || this.queue[drop].priority > priority) return;
      this.release(drop);
    }
    const item = this.free.pop();
    item.text = text; item.key = key; item.priority = priority; item.left = duration;
    item.born = this.clock; item.kind = kind; item.valid = valid;
    item.selected = false; item.shown = false; item.recorded = false; item.height = 0; item.displayKey = null;
    this.queue.push(item);
    this.sync();
  }

  visible(id) {
    for (const source of this.sources) if (source.id === id) return source.selected;
    return false;
  }

  // 操作の助言は三秒だけ。同じ文を出す間隔は八秒以上あける。
  adviceVisible(key, remember = false) {
    this.adviceTimes ||= new Map();
    const at = this.adviceTimes.get(key);
    if (at !== undefined && this.clock - at < 8) return this.clock - at < 3;
    if (remember) this.adviceTimes.set(key, this.clock);
    return true;
  }

  room(priority) {
    let count = 0;
    for (const item of this.picks) {
      count++;
      // 台詞を待ち列から出すのは、共通の枠が使える時だけ。
      if ((priority === 70 || priority === 80) && item.id !== 'objectives' && item.id !== 'choice') return false;
    }
    return count < Math.min(3, this.limit);
  }

  repeatGap() {
    return Math.max(8, Number(this.hud.rt?.def?.noticeRepeatGap ?? this.hud.rt?.world?.def?.noticeRepeatGap) || 8);
  }

  update(dt) {
    this.clock += Math.max(0, Number(dt) || 0);
    if (this.clock >= (this.reasonScan || 0)) {
      this.reasonScan = this.clock + 0.5;
      refreshNoticeReasons(this.hud.rt);
      this.trimSeen(this.seen);
      this.trimSeen(this.accepted);
      this.trimSeen(this.displayed);
    }
    for (let i = this.queue.length - 1; i >= 0; i--) {
      const item = this.queue[i];
      if (item.selected) item.left -= dt;
      if (item.left <= 0 || this.clock - item.born > (item.priority >= 75 ? 60 : 12)) { this.rememberWarning(item); this.release(i); }
    }
    this.sync();
  }

  trimSeen(table) {
    if (table.size <= 80) return;
    const gap = this.repeatGap();
    for (const [text, time] of table) if (this.clock - time >= gap) table.delete(text);
  }

  pick(source) {
    const picks = this.picks;
    const limit = Math.max(0, Math.min(3, this.limit));
    if (picks.length > limit) picks.length = limit;
    if (!limit || picks.includes(source)) return;
    const key = this.displayKey(source);
    // 今する事は常設。防御などで隠れても八秒待たずに戻し、方向の印だけを残さない。
    // 再表示を間引くのは、台詞など一時の知らせだけ。
    const persistentTask = source.id === 'objectives';
    if (!persistentTask && this.operationAdvice(source.el ? source.el.textContent : this.displayText(source))) return;
    const continuous = this.lastPicks.includes(source) && source.displayKey === key;
    if (!persistentTask && !continuous && this.clock - (this.displayed.get(key) ?? -Infinity) < this.repeatGap()) return;
    for (let i = 0; i < picks.length; i++) if (this.displayKey(picks[i]) === key) {
      if (picks[i].priority >= source.priority) return;
      picks.splice(i--, 1);
    }
    // 台詞・見出し・手ほどき・短い知らせは同時に一つだけ。
    const message = !source.el || (source.id !== 'objectives' && source.id !== 'choice');
    if (message) for (let i = 0; i < picks.length; i++) {
      const old = picks[i];
      if (old.el && (old.id === 'objectives' || old.id === 'choice')) continue;
      // 一枠には一つ。同じ重要さなら新しい物を残す。
      if (old.priority > source.priority || old.priority === source.priority && (old.born || 0) > (source.born || 0)) return;
      picks.splice(i, 1); break;
    }
    let at = 0;
    while (at < picks.length && picks[at].priority >= source.priority) at++;
    if (at >= limit) return;
    picks.splice(at, 0, source);
    if (picks.length > limit) picks.length = limit;
    if (this.space > 0) {
      let used = 0;
      for (let i = 0; i < picks.length; i++) {
        used += (i ? 8 : 0) + (picks[i].height || 44);
        if (i && used > this.space) { picks.length = i; break; }
      }
    }
  }

  sync() {
    this.picks.length = 0;
    const intro = !document.getElementById('intro').hidden || !!this.hud.openingActive;
    const choosing = !document.getElementById('choice').hidden;
    const careSequence = !choosing && this.sources[1].el.classList.contains('sequential-order');
    const sunoChoice = choosing && this.hud.rt?.def.key === 'sunomata';
    this.root.classList.toggle('suno-choice', sunoChoice);
    this.root.classList.toggle('shiga-choice', choosing && this.hud.rt?.def.key === 'shiga' && this.hud.rt?.choice?.options.length === 2);
    this.root.classList.toggle('tano-notices', this.hud.rt?.def.key === 'tano');
    this.root.classList.toggle('anegawa-notices', this.hud.rt?.def.key === 'anegawa');
    const phone = this.shortScreen.matches && document.documentElement.classList.contains('touch');
    this.rail.classList.toggle('choosing', choosing);
    const taskParent = this.rail;
    if (this.sources[1].el.parentNode !== taskParent) {
      taskParent.appendChild(this.sources[1].el);
    }
    this.taskDock.hidden = true;
    // 記録の入口も任務の中へ畳み、独立した四枚目の札を作らない。
    const logEntry = this.hud.logEntry, logParent = this.sources[1].el;
    if (logEntry && logEntry.parentNode !== logParent) {
      logParent.appendChild(logEntry);
      this.hud.rectsT = 0;
    }
    this.limit = phone || (!choosing && (this.shortScreen.matches || this.sources[1].el.classList.contains('expand'))) ? 2 : 3;
    if (!choosing && !document.getElementById('boss').hidden) this.limit = Math.min(this.limit, 2);
    if (!choosing && this.hud.rt?.def.noticeLimit) this.limit = Math.min(this.limit, this.hud.rt.def.noticeLimit);
    const rt = this.hud.rt;
    const retreating = !choosing && retreatRequired(rt);
    const retreat = this.hud.retreatGuide;
    const retreatArrived = !!rt && retreat?.active && retreat.valid && !retreat.treatment &&
      Math.hypot(retreat.x - rt.player.u.pos.x, retreat.z - rt.player.u.pos.z) < retreat.radius;
    const retreatMarks = !choosing && retreat?.active && retreat.valid && !retreat.treatment;
    const guarding = !choosing && (!!this.hud.guardAlly || !!rt && !!rescueTarget(rt) && rt.def.guardGuideAllowed?.(rt) !== false);
    const rainUrgent = !choosing && this.root.classList.contains('rain-danger');
    const dodging = !choosing && this.root.classList.contains('dodge-active');
    const working = !choosing && this.root.classList.contains('working');
    const waitGuard = !choosing && !!this.hud.waitGuardButton && !this.hud.waitGuardButton.hidden;
    // 志賀の構え中は命・構え釦・持ち場の三枚。相手の札は任務を選んだ後に畳まれる。
    const shigaGuardTask = rt?.def.key === 'shiga' && waitGuard && rt.def.keepTaskWithGuard;
    const defending = !choosing && !!this.hud.defendEnemy?.alive;
    const fireWork = working && /火を(?:つけ|かけ|放|移)|篝火を焚/.test(document.getElementById('prompt').dataset.action || '');
    // 命・行き先・操作も数える。命の札の一枠は常に空ける。
    if (!choosing) {
      const destination = !!this.hud.missionPinOutside; // 端の方向と行き先の名前も一枚に数える。
      const operation = dodging || working || !!rt?.touchCoachActive || !!rt?.touchAttackGuideActive || !!rt?.nearestInteract();
      const target = document.getElementById('target');
      const boss = document.getElementById('boss');
      const combatCards = Number(!boss.hidden && !boss.classList.contains('symbol-only')) + Number(!shigaGuardTask && !target.hidden && !target.classList.contains('notice-muted'));
      const defendingPlace = !!this.hud.defendedLocation(rt);
      // 敵の太い輪も一枠に数え、命・任務札と合わせて三つまでにする。
      const enemyLabel = !!this.hud.enemyFrameShown && (!rt?.def.enemySignOnly || !rt.def.town && !rt.def.dojo);
      const damageLabel = !!rt && rt.player.u.alive && !rt.over && !rt.choice && !this.hud.openingActive &&
        !rt.player.camShot && !this.hud.bigmap && this.hud.damageWordRt === rt &&
        rt.t < this.hud.damageWordUntil && rt.t < this.hud.damageDirectionUntil;
      this.limit = Math.max(0, Math.min(this.limit, 3 - Number(!!rt && !intro) - Number(destination) - Number(operation) - combatCards - Number(defendingPlace) - Number(enemyLabel) - Number(damageLabel)));
    }
    const oke = rt?.def.key === 'okehazama';
    // 隅の報せも一枚と数える。危険がある時は任務と警告を先にする。
    if (oke && !this.root.classList.contains('compact-battle')) this.limit = Math.max(0, Math.min(this.limit, this.hud.okeThreatActive ? 1 : 2) -
      (!document.getElementById('boss').hidden ? 1 : 0) - (!document.getElementById('target').hidden ? 1 : 0));
    // 横画面は記録の入口と相手・行き先の分を残し、読む札は一枚だけ。
    if (!choosing && this.root.classList.contains('compact-battle')) this.limit = Math.min(this.limit, 1);
    // 命と「敵」の印に二枠を使い、退く先は既存の任務一枚へまとめる。
    if (retreatMarks) this.limit = Math.min(this.limit, 1);
    if (waitGuard) this.limit = Math.min(this.limit, 1);
    // 命・救助の指示と操作・本人の札で三枚。別の知らせは記録へ回す。
    if (!choosing && rt && rescueTarget(rt) && !retreating) this.limit = Math.min(this.limit, 1);
    if (rainUrgent) this.limit = Math.min(this.limit, 1);
    const combatThree = !choosing && this.root.classList.contains('combat-three') &&
      !waitGuard && !rainUrgent && !dodging && !working && !retreatMarks;
    // 目標の枠と体力に二枠を使い、読む札は操作を含む指示一枚にする。
    if (combatThree) this.limit = 1;
    const retreatGuidance = rt?.def.withdrawGuidance && rt.withdrawal?.losing === 0 && rt.player.u.alive && !rt.ended && !rt.retryOpen;
    for (const source of this.sources) {
      source.selected = false;
      if (rt?.retryOpen) continue;
      if (combatThree && source.id !== 'objectives') continue;
      // 下馬から手当てまでは今の操作だけ。命と出血は既存の命の札へまとめる。
      if (careSequence && source.id !== 'objectives') continue;
      // 指の案内中は今の操作一枚へ集め、命と行き先の印の場所を空ける。
      if (rt?.touchCoachActive && source.id !== 'choice' && !((shigaGuardTask || rt.def.keepTaskWithCoach) && source.id === 'objectives') && !source.el.classList.contains('expand')) continue;
      if (retreatMarks && source.id !== 'objectives') continue;
      if ((source.id === 'tutorial' || source.id === 'skiphint') && rt && !oke && !rt.def.town && !rt.def.dojo) continue;
      if (source.id === 'tutorial' && this.root.classList.contains('safety-travel')) continue;
      // 移動中は行き先だけを読む。攻撃の助言は敵と向き合う時に譲る。
      if (source.id === 'tutorial' && !this.hud.tutCur?.auto &&
          (rt?.def.routeGuidePriority?.(rt) || rt?.missionGuide?.marker && !rt.guideEnemyShown &&
          rt.missionGuide.distance >= (rt.missionGuide.marker.guideRadius || 8))) continue;
      // 待機中の指図は押せる札に集める。いのちと危険の知らせの分を空ける。
      if (waitGuard && source.id !== 'choice' && source.id !== 'objectives') continue;
      if (defending && source.id !== 'objectives' && source.id !== 'choice') continue;
      if (rainUrgent && !(rt?.def.keepTaskWithRain && source.id === 'objectives')) continue;
      // よける操作が済むまでは移動の下知を重ねず、済んだ次の更新で任務へ戻す。
      if (dodging && !source.el.classList.contains('expand')) continue;
      if ((retreating || guarding) && source.id !== 'objectives' && !(retreatArrived && source.id === 'tutorial')) continue;
      // 押す札が出たら案内をそこへ集める。任務一覧は自分で開いた時だけ残す。
      if (working && !rt?.def.keepTaskWithWork && !retreating && !guarding && source.id === 'objectives' && !source.el.classList.contains('expand')) continue;
      if (working && (source.id === 'tutorial' || source.id === 'situation' || source.id === 'skiphint')) continue;
      // 火付けの押す場所を先に見せ、戦い方や台詞の札は重ねない。
      if (fireWork && source.id !== 'choice' && !(source.id === 'objectives' && source.el.classList.contains('expand'))) continue;
      // 使いの出発は遊び手の任務ではない。行き先の案内と取り違えさせない。
      if (rt?.missionGuide?.marker && source.id !== 'objectives' && source.id !== 'choice' &&
          /使番が.+へ(?:走った|下知を運ぶ)|へ使番を送った|使いが 味方へ向かった/.test(source.el.textContent)) continue;
      if (source.id === 'tutorial') source.priority = this.hud.tutCur?.auto ? 85 : 10;
      // 戦の案内が移動・防御・攻撃を選ぶ間は、古い攻撃の手ほどきを重ねない。
      if (source.id === 'tutorial' && rt && !rt.def.town && !rt.def.dojo && this.hud.tutCur?.auto &&
          ['c_swing', 'c_guard'].includes(this.hud.tutCur.items.find(item => !item.done)?.id) &&
          (rt.missionGuide?.marker || defending || waitGuard || rt.guideEnemyShown)) continue;
      // 天王寺の退避中は、道順と手当てを示す任務を短い警告で追い出さない。
      if (source.id === 'objectives') source.priority = guarding ? 115 : rt?.def.key === 'tennoji' && rt.flags.shelterShown ? 115 : rt?.guideEnemyShown ? 105 : this.root.classList.contains('compact-battle') ? 110 : 90;
      if (oke && source.id === 'tutorial') {
        source.priority = 10;
        if (!this.adviceVisible(source.el.textContent)) continue;
      }
      const el = source.el;
      if (source.id === 'objectives') {
        const expanded = el.classList.contains('expand');
        const action = el.querySelector('.battle-action:not([hidden])');
        const text = el.querySelector('li.cur .obj-now');
        const hasTask = waitGuard || (expanded ? !!el.querySelector('li') : !!(text?.textContent.trim() || action?.textContent.trim()));
        el.classList.toggle('empty-task', !hasTask);
        if (!hasTask) continue;
      }
      // 中身が消えた札を枠だけで選ばない。見出しの補足だけの空札も除く。
      if (source.id !== 'objectives' && source.id !== 'choice' && !el.textContent.trim()) continue;
      if (source.id === 'banner' && !el.querySelector('.brush')?.textContent.trim()) continue;
      if (source.id === 'tutorial' && /手ほどき[\s　]*(済み|皆伝)/.test(el.textContent)) continue;
      const active = source.id === 'banner' ? this.hud.bannerT > 0 : source.id === 'subtitle' ? this.hud.subT > 0 && !!el.textContent.trim() : source.id === 'objectives' ? (!rt?.over || retreatGuidance) && ((!!el.querySelector('li,.victory-condition:not([hidden])') && (!this.root.classList.contains('no-objectives') || this.root.classList.contains('mission-visible'))) || (logEntry && !logEntry.hidden)) : !el.hidden;
      // 任務が台詞の後から出た時も、同文の二枚目は隠す。
      if (source.id === 'subtitle' && this.hud.shownLine && this.hud.taskRepeats(this.hud.shownLine.speaker, this.hud.shownLine.text)) continue;
      // 箕作城では門の打ち方を先に見せ、首や歩き方の札を重ねない。
      const gateFirst = this.hud.rt?.def.noticeLimit && this.hud.rt?._gg?.objOn;
      // 助言は今の任務の下へ。同じ要素を移すだけで、札や文を毎コマ作り直さない。
      if (active && !(sunoChoice && source.id === 'objectives' && !this.root.classList.contains('mission-visible')) && !(gateFirst && source.id === 'tutorial') && !intro && (!choosing || source.id === 'choice' || source.id === 'objectives')) this.pick(source);
    }
    for (let i = 0; i < this.queue.length; i++) {
      const item = this.queue[i]; item.selected = false;
      if (combatThree) continue;
      if (rt?.retryOpen) continue;
      if (careSequence) continue;
      // 指の案内中は今の操作一枚へ集め、命と行き先の印の場所を空ける。
      if (rt?.touchCoachActive) continue;
      if (guarding && !retreating) continue;
      if (item.kind !== 'injury' && (defending || waitGuard || retreating || guarding || dodging)) continue;
      // 逃げ先の札へ警告をまとめ、上端に同じ指示を重ねない。
      if (rt?.dodgeGuide && item.kind === 'warn' && /^矢が来る/.test(item.text)) continue;
      if (rainUrgent && !(item.kind === 'warn' && /^矢が来る/.test(item.text))) continue;
      if (!rainUrgent && item.kind === 'warn' && /^矢が来る/.test(item.text) && this.root.classList.contains('working')) continue;
      if (fireWork && item.kind !== 'injury') continue;
      if ((working && item.kind === 'task') || (fireWork && /火.*長押し|長押し.*火/.test(item.text))) continue;
      if (/手ほどき[\s　]*(済み|皆伝)/.test(item.text)) { this.release(i--); continue; }
      // 手当ての行き先と押す所を任務に出している時は、同じ警告でその札を追い出さない。
      if (this.root.classList.contains('compact-battle') && rt?.player.treatmentLeft > 0 &&
          this.hud.retreatGuide?.active && item.text.startsWith('血が止まらない')) continue;
      if ((item.valid && !item.valid()) || (item.kind === 'warn' && !item.shown && this.clock - item.born > 3)) { this.rememberWarning(item); this.release(i--); continue; }
      if (!item.shown && !this.repeatOk(item.text)) continue;
      if (!intro && !sunoChoice && (!choosing || item.kind === 'task' || item.priority >= 110)) this.pick(item);
    }
    let card = 0;
    let messageVisible = false, messageOrder = 0;
    for (let i = 0; i < this.picks.length; i++) {
      const item = this.picks[i]; item.selected = true;
      if (item.el) {
        if (oke && item.id === 'tutorial') this.adviceVisible(item.el.textContent, true);
        setOrder(item.el, i);
        if (item.id === 'subtitle') { messageVisible = true; messageOrder = i; }
      }
      else {
        const el = this.cards[card++];
        const parent = this.message;
        if (el.parentNode !== parent) parent.appendChild(el);
        // 任務が同じ欄に見えている時は、長い任務文を二枚に重ねない。
        // 任務が隠れている時と選択中は、知らせだけでも全文を読めるようにする。
        const text = this.displayText(item);
        const treatment = item.text.startsWith('血が止まらない') && text !== item.text;
        if (el._notice !== item || el.textContent !== text) {
          el.textContent = text; el.setAttribute('aria-label', item.text);
          el.className = 'battle-notice' + (item.kind === 'warn' ? ' warn' : '') + (treatment ? ' treatment' : '') + (/^(柱|壁)のうしろへ$/.test(text) ? ' cover-advice' : ''); el._notice = item;
        }
        messageVisible = true; messageOrder = i;
        setOrder(el, i); setHidden(el, false);
      }
    }
    if (messageVisible) setOrder(this.message, messageOrder);
    setHidden(this.message, !messageVisible);
    for (; card < this.cards.length; card++) setHidden(this.cards[card], true);
    const advice = this.sources[4];
    if (advice.el.parentNode !== this.rail) this.rail.appendChild(advice.el);
    for (const source of this.sources) source.el.classList.toggle('notice-muted', !source.selected);
    // 高さは札の交代時に測る。待っている台詞と知らせの残り時間は減らさない。
    if (this.picks.length !== Number(!!this.lastPicks[0]) + Number(!!this.lastPicks[1]) + Number(!!this.lastPicks[2]) ||
        this.picks.some((item, i) => item !== this.lastPicks[i] || item.displayKey !== this.displayKey(item))) this.fitMessage();
    for (const item of this.picks) {
      const key = this.displayKey(item);
      if (!this.lastPicks.includes(item) || item.displayKey !== key) {
        this.displayed.set(key, this.clock);
        this.seen.set(key, this.clock);
        if (!item.el) { this.displayed.set(item.key, this.clock); this.seen.set(item.key, this.clock); }
        if (!item.el && !item.shown) { item.shown = true; const reason = noticeReason(item.text); if (reason && rt) (rt._reasonSeen || (rt._reasonSeen = new Set())).add(reason); }
      }
      item.displayKey = key;
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
