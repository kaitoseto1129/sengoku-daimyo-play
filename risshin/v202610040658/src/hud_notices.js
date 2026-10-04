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
    this.clock = 0;
    const style = document.createElement('style');
    style.textContent = `
#hud #battle-notices { position:absolute; left:calc(76px + env(safe-area-inset-left, 0px)); top:calc(96px + env(safe-area-inset-top, 0px)); width:min(320px, 32%); max-height:calc(100% - 196px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)); display:flex; flex-direction:column; gap:8px; overflow-y:auto; overscroll-behavior:contain; touch-action:pan-y; pointer-events:auto; }
#hud #boss { left:calc(100px + min(320px, 32%) + env(safe-area-inset-left, 0px)); right:calc(216px + env(safe-area-inset-right, 0px)); width:auto; max-width:none; margin-top:0; transform:none; min-width:0; grid-template-columns:minmax(0, 1fr); text-align:center; }
#hud #boss span { min-width:0; width:100%; max-width:100%; overflow-wrap:anywhere; box-sizing:border-box; }
#hud #boss i { width:min(360px, 100%); box-sizing:border-box; }
#hud #battle-notices > :is(#choice,#objectives,#banner,#subtitle,#tutorial,#situation,#skiphint,.battle-notice) { position:relative !important; inset:auto !important; transform:none !important; width:100% !important; min-width:0 !important; max-width:100% !important; margin:0 !important; box-sizing:border-box; font-size:max(12px, calc(14px * var(--text-scale, 1))) !important; line-height:1.45 !important; letter-spacing:0 !important; padding:6px 10px !important; background:rgba(12,10,8,.9) !important; text-align:left; visibility:visible !important; opacity:1 !important; animation:none !important; flex:0 0 auto; }
#hud #battle-notices > [hidden], #hud #battle-notices > .notice-muted { display:none !important; }
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
#hud #choice-tasks #objectives { visibility:visible !important; opacity:1 !important; margin:0 !important; padding:0 !important; min-height:44px; max-height:none !important; background:none !important; box-shadow:none; overflow:visible; }
#hud #choice-tasks #objectives h4, #hud #choice-tasks #objectives li:not(.cur), #hud #choice-tasks #objectives li :is(.tag,small,.opb) { display:none !important; }
#hud #choice-tasks #objectives li.cur { display:block; margin:0; padding:0; font-size:max(12px, calc(14px * var(--text-scale, 1))); line-height:1.4; background:none; box-shadow:none; }
#hud #choice-tasks .battle-notice { font-size:max(12px, calc(12px * var(--text-scale, 1))); line-height:1.4; padding-top:4px; border-top:1px solid var(--gold-line); overflow-wrap:anywhere; }
#hud:has(#intro:not([hidden])) #choice-tasks, #hud:has(#bigmap:not([hidden])) #choice-tasks, body:has(#pause:not([hidden])) #choice-tasks, #hud.photo #choice-tasks,
#hud:has(#intro:not([hidden])) #choice-tasks > *, #hud:has(#bigmap:not([hidden])) #choice-tasks > *, body:has(#pause:not([hidden])) #choice-tasks > *, #hud.photo #choice-tasks > * { visibility:hidden !important; }
#hud #battle-notices #tutorial .lbl { display:none; }
#hud #battle-notices #tutorial .how { display:block; margin:4px 0 0; font-size:max(12px, calc(13px * var(--text-scale, 1))); line-height:1.5; }
#hud #battle-notices #tutorial .what { display:block; font-size:max(12px, calc(14px * var(--text-scale, 1))); margin:0; }
#hud:has(#intro:not([hidden])) #battle-notices, #hud:has(#bigmap:not([hidden])) #battle-notices, body:has(#pause:not([hidden])) #battle-notices, #hud.photo #battle-notices { visibility:hidden; }
#hud:has(#intro:not([hidden])) #battle-notices > *, #hud:has(#bigmap:not([hidden])) #battle-notices > *, body:has(#pause:not([hidden])) #battle-notices > *, #hud.photo #battle-notices > * { visibility:hidden !important; }
@media (max-height:500px) {
  #hud #battle-notices:not(.choosing) { left:calc(16px + env(safe-area-inset-left, 0px)); top:calc(72px + env(safe-area-inset-top, 0px)); width:min(300px, 34%); max-height:calc(100% - 144px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)); }
  /* 知らせの右端から24px空け、残った幅に武将の札を収める。 */
  #hud #boss { top:calc(64px + env(safe-area-inset-top, 0px)); bottom:auto; left:calc(200px + min(320px, 32vw) + env(safe-area-inset-left, 0px)); right:calc(160px + env(safe-area-inset-right, 0px)); width:auto; max-width:none; }
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
#hud #boss { top:calc(16px + env(safe-area-inset-top, 0px)); left:calc(100px + env(safe-area-inset-left, 0px)); right:calc(216px + env(safe-area-inset-right, 0px)); }
html[data-text-size=l] #hud #battle-notices:not(.choosing) { width:min(380px, 40vw); }
@media (max-height:500px) {
 #hud #boss { top:calc(8px + env(safe-area-inset-top, 0px)); left:calc(200px + env(safe-area-inset-left, 0px)); right:calc(160px + env(safe-area-inset-right, 0px)); }
 html[data-text-size=l] #hud #battle-notices:not(.choosing) { left:calc(16px + env(safe-area-inset-left, 0px)); }
}
@media (max-width:600px) {
 #hud #battle-notices.choosing { left:calc(16px + env(safe-area-inset-left, 0px)); width:calc(100vw - 32px - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px)); }
}
#hud #intro .card { animation:none; opacity:1; max-height:calc(100dvh - 32px); max-width:calc(100vw - 32px); overflow-y:auto; overscroll-behavior:contain; box-sizing:border-box; }
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
    document.head.appendChild(style);
    this.rail.addEventListener('scroll', () => this.choiceMore(), { passive:true });
    window.addEventListener('resize', () => this.fitChoice());
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
    this.queue.length = 0; this.seen.clear(); this.clock = 0;
    for (const el of this.cards) { el.hidden = true; el._notice = null; }
    this.sync();
  }

  // 話し手や出し方を問わず、同じ文は実際に出してから八秒あける。
  // 待たせる物は記録せずに調べ、出す時にもう一度調べて記録する。
  repeatOk(text, remember = false) {
    text = String(text);
    if (this.clock - (this.seen.get(text) ?? -Infinity) < 8) return false;
    if (remember) this.seen.set(text, this.clock);
    return true;
  }

  push(text, priority, seconds = 3, kind = '', valid = null) {
    text = String(text);
    if (priority >= 75 && kind !== 'task' && kind !== 'warn') {
      const log = this.hud.resultNotices || (this.hud.resultNotices = []);
      if (!log.some((line) => line.text === text)) {
        log.push({ text, t:Math.floor(this.hud.rt?.t || 0) });
        if (log.length > 60) log.shift();
      }
    }
    if (!this.repeatOk(text) || this.queue.some((item) => item.text === text)) return;
    // 古い任務の書き換えは持ち越さない。
    if (kind === 'task') for (let i = this.queue.length - 1; i >= 0; i--) if (this.queue[i].kind === kind) this.queue.splice(i, 1);
    this.queue.push({ text, priority, left:Math.max(seconds, Math.min(10, 1.2 + text.length * 0.1)), born:this.clock, kind, valid, selected:false });
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
    for (const item of this.queue) if (item.selected && item.priority >= priority) count++;
    return count < 3;
  }

  update(dt) {
    this.clock += dt;
    for (let i = this.queue.length - 1; i >= 0; i--) {
      const item = this.queue[i];
      if (item.selected) item.left -= dt;
      if (item.left <= 0 || this.clock - item.born > (item.priority >= 75 ? 60 : 12)) { this.rememberWarning(item); this.queue.splice(i, 1); }
    }
    // 重複除けの覚え書きも無限に増やさない。
    if (this.seen.size > 80) for (const [text, time] of this.seen) if (this.clock - time >= 8) this.seen.delete(text);
    this.sync();
  }

  pick(source) {
    const picks = this.picks;
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
    this.rail.classList.toggle('choosing', choosing);
    if (this.choosing !== choosing) {
      (choosing ? this.taskDock : this.rail).appendChild(this.sources[1].el);
      this.taskDock.hidden = !choosing;
    }
    this.limit = !choosing && this.sources[1].el.classList.contains('expand') ? 2 : 3;
    for (const source of this.sources) {
      source.selected = false;
      const el = source.el;
      const active = source.id === 'banner' ? this.hud.bannerT > 0 : source.id === 'subtitle' ? this.hud.subT > 0 : source.id === 'objectives' ? !!el.querySelector('li') && !this.root.classList.contains('no-objectives') : !el.hidden;
      if (active && !intro && (!choosing || source.id === 'choice' || source.id === 'objectives')) this.pick(source);
    }
    for (let i = 0; i < this.queue.length; i++) {
      const item = this.queue[i]; item.selected = false;
      if ((item.valid && !item.valid()) || (item.kind === 'warn' && !item.shown && this.clock - item.born > 3)) { this.rememberWarning(item); this.queue.splice(i--, 1); continue; }
      if (!item.shown && !this.repeatOk(item.text)) { this.queue.splice(i--, 1); continue; }
      if (!intro && (!choosing || item.kind === 'task' || item.priority >= 110)) this.pick(item);
    }
    let card = 0;
    for (let i = 0; i < this.picks.length; i++) {
      const item = this.picks[i]; item.selected = true;
      if (item.el) item.el.style.order = i;
      else {
        if (!item.shown) { this.repeatOk(item.text, true); item.shown = true; }
        const el = this.cards[card++];
        const parent = choosing && item.kind === 'task' ? this.taskDock : this.rail;
        if (el.parentNode !== parent) parent.appendChild(el);
        if (el._notice !== item) { el.textContent = item.text; el.className = 'battle-notice' + (item.kind === 'warn' ? ' warn' : ''); el._notice = item; }
        el.style.order = i; el.hidden = false;
      }
    }
    for (; card < this.cards.length; card++) this.cards[card].hidden = true;
    for (const source of this.sources) source.el.classList.toggle('notice-muted', !source.selected);
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
