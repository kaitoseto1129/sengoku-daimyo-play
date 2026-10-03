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
#hud #battle-notices { position:absolute; left:calc(76px + env(safe-area-inset-left, 0px)); top:calc(96px + env(safe-area-inset-top, 0px)); width:min(320px, 32%); max-height:calc(100% - 196px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)); display:flex; flex-direction:column; gap:8px; overflow-y:auto; pointer-events:auto; }
#hud #battle-notices > :is(#choice,#objectives,#banner,#subtitle,#tutorial,#situation,#skiphint,.battle-notice) { position:relative !important; inset:auto !important; transform:none !important; width:100% !important; min-width:0 !important; max-width:100% !important; margin:0 !important; box-sizing:border-box; font-size:max(12px, calc(14px * var(--text-scale, 1))) !important; line-height:1.45 !important; letter-spacing:0 !important; padding:6px 10px !important; background:rgba(12,10,8,.9) !important; text-align:left; visibility:visible !important; opacity:1 !important; animation:none !important; flex:0 0 auto; }
#hud #battle-notices > [hidden], #hud #battle-notices > .notice-muted { display:none !important; }
#hud #battle-notices #choice { pointer-events:auto; flex:1 1 auto; min-height:88px; max-height:none; overflow:auto; }
#hud #battle-notices #choice .opt { min-height:44px; box-sizing:border-box; align-content:center; padding:4px 0; margin-top:8px; }
#hud #battle-notices #choice .opt small { display:block; min-width:0; white-space:normal; overflow-wrap:anywhere; font-size:max(12px, calc(13px * var(--text-scale, 1))); line-height:1.4; max-height:2.8em; overflow:auto; text-overflow:clip; }
#hud #battle-notices #choice h5 { font-size:max(12px, calc(14px * var(--text-scale, 1))); margin:0 0 4px; }
#hud #battle-notices #objectives { min-height:44px; max-height:56px; overflow:auto; pointer-events:auto; cursor:pointer; }
#hud #battle-notices #objectives h4, #hud #battle-notices #objectives li:not(.cur), #hud #battle-notices #objectives li :is(.tag,small,.opb) { display:none !important; }
#hud #battle-notices:not(.choosing) #objectives li.cur small { display:block !important; font-size:max(12px, calc(12px * var(--text-scale, 1))); }
#hud #battle-notices #objectives li.cur { display:block; font-size:max(12px, calc(14px * var(--text-scale, 1))); margin:0; padding:0; background:none; box-shadow:none; }
#hud #battle-notices:not(.choosing) #objectives.expand { max-height:112px; }
#hud #battle-notices:not(.choosing) #objectives.expand li { display:block !important; }
#hud #battle-notices #banner .brush { padding:0; background:none !important; font-size:max(12px, calc(16px * var(--text-scale, 1))); -webkit-text-stroke:0; }
#hud #battle-notices #banner small { max-width:100%; margin:0; font-size:max(12px, calc(12px * var(--text-scale, 1))); letter-spacing:0; }
#hud #battle-notices #skiphint { min-height:44px; pointer-events:auto; }
#hud #battle-notices #subtitle { pointer-events:auto !important; cursor:pointer; min-height:44px; }
#hud #battle-notices #subtitle::after { content:none !important; }
#hud #battle-notices #subtitle .more { display:none; }
#hud #battle-notices .battle-notice.warn { color:#ffcf7a; border-left:3px solid #ffcf7a; }
#hud #battle-notices :is(#banner,#subtitle,#tutorial,#situation,#skiphint,.battle-notice) { max-height:calc(56px * var(--text-scale, 1)); overflow:auto; pointer-events:auto; }
#hud #battle-notices.choosing { left:calc(16px + env(safe-area-inset-left, 0px)); top:calc(62px + env(safe-area-inset-top, 0px)); width:min(320px, 34vw); max-height:calc(100% - 162px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)); }
#hud #battle-notices #choice.compact .opt small { font-size:max(12px, calc(12px * var(--text-scale, 1))); }
#hud #battle-notices #choice.compact h5 { display:-webkit-box; -webkit-box-orient:vertical; -webkit-line-clamp:2; overflow:hidden; }
#hud:has(#choice:not([hidden])) .tl { visibility:hidden; }
#hud #choice-tasks { width:100%; min-width:0; background:rgba(12,10,8,.9); padding:6px 10px; box-sizing:border-box; }
#hud #choice-tasks[hidden], #hud #choice-tasks > [hidden], #hud #choice-tasks > .notice-muted { display:none !important; }
#hud #choice-tasks #objectives { visibility:visible !important; opacity:1 !important; margin:0 !important; padding:0 !important; min-height:44px; max-height:none !important; background:none !important; box-shadow:none; overflow:visible; }
#hud #choice-tasks #objectives h4, #hud #choice-tasks #objectives li:not(.cur), #hud #choice-tasks #objectives li :is(.tag,small,.opb) { display:none !important; }
#hud #choice-tasks #objectives li.cur { display:block; margin:0; padding:0; font-size:max(12px, calc(14px * var(--text-scale, 1))); line-height:1.4; background:none; box-shadow:none; }
#hud #choice-tasks .battle-notice { font-size:max(12px, calc(12px * var(--text-scale, 1))); line-height:1.4; padding-top:4px; border-top:1px solid var(--gold-line); overflow-wrap:anywhere; }
#hud:has(#intro:not([hidden])) #choice-tasks, #hud:has(#bigmap:not([hidden])) #choice-tasks, body:has(#pause:not([hidden])) #choice-tasks, #hud.photo #choice-tasks,
#hud:has(#intro:not([hidden])) #choice-tasks > *, #hud:has(#bigmap:not([hidden])) #choice-tasks > *, body:has(#pause:not([hidden])) #choice-tasks > *, #hud.photo #choice-tasks > * { visibility:hidden !important; }
#hud #battle-notices #tutorial :is(.lbl,.how) { display:none; }
#hud #battle-notices #tutorial .what { display:block; font-size:max(12px, calc(14px * var(--text-scale, 1))); margin:0; }
#hud:has(#intro:not([hidden])) #battle-notices, #hud:has(#bigmap:not([hidden])) #battle-notices, body:has(#pause:not([hidden])) #battle-notices, #hud.photo #battle-notices { visibility:hidden; }
#hud:has(#intro:not([hidden])) #battle-notices > *, #hud:has(#bigmap:not([hidden])) #battle-notices > *, body:has(#pause:not([hidden])) #battle-notices > *, #hud.photo #battle-notices > * { visibility:hidden !important; }
@media (max-height:500px) {
  #hud #battle-notices:not(.choosing) { left:calc(176px + env(safe-area-inset-left, 0px)); }
  #hud #battle-notices #choice .opt small { font-size:max(12px, calc(12px * var(--text-scale, 1))); }
}
@media (min-height:501px) { #hud #battle-notices { max-height:min(360px, calc(100% - 196px)); } }
`;
    // 拡大した文は切らず、決まった札の範囲で送れるようにする。
    style.textContent += `
html[data-text-size=l] #hud #battle-notices #choice.compact h5 { display:block; -webkit-line-clamp:unset; overflow:visible; }
`;
    document.head.appendChild(style);
    window.addEventListener('resize', () => this.fitChoice());
    this.sync();
  }

  // 札が高い時は説明の字を少し小さくする。測るのは札の書き換えと画面の大きさが変わった時だけ。
  fitChoice() {
    const el = this.sources[0].el;
    if (el.hidden) return;
    el.classList.remove('compact');
    if (el.scrollHeight > el.clientHeight) el.classList.add('compact');
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

  push(text, priority, seconds = 3, kind = '') {
    text = String(text);
    if (!this.repeatOk(text) || this.queue.some((item) => item.text === text)) return;
    // 古い任務の書き換えは持ち越さない。
    if (kind === 'task') for (let i = this.queue.length - 1; i >= 0; i--) if (this.queue[i].kind === kind) this.queue.splice(i, 1);
    this.queue.push({ text, priority, left:seconds, born:this.clock, kind, selected:false });
    this.queue.sort((a, b) => b.priority - a.priority || a.born - b.born);
    if (this.queue.length > 12) this.queue.length = 12;
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
      if (item.left <= 0 || this.clock - item.born > (item.priority >= 75 ? 60 : 12)) this.queue.splice(i, 1);
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
      const active = source.id === 'banner' ? this.hud.bannerT > 0 : source.id === 'subtitle' ? this.hud.subT > 0 : source.id === 'objectives' ? !!el.querySelector('li.cur') && !this.root.classList.contains('no-objectives') : !el.hidden;
      if (active && !intro && (!choosing || source.id === 'choice' || source.id === 'objectives')) this.pick(source);
    }
    for (let i = 0; i < this.queue.length; i++) {
      const item = this.queue[i]; item.selected = false;
      if (!item.shown && !this.repeatOk(item.text)) { this.queue.splice(i--, 1); continue; }
      if (!intro && (!choosing || item.kind === 'task')) this.pick(item);
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
    if (!choosing) this.choiceHead = null;
  }
}
