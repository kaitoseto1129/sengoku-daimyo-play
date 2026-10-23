import { setText, setWidth, coachCss, $, esc, keyCaps } from "./hud_common.js";
import { isTouch } from "./touch.js";
import { K } from "./settings.js";

export class HudCards {


  // 手ほどき：いまの段だけを札に出す
  renderTut(t) { this.tutCur = t; this.drawCard(); }

  // 戦の進み・戦況・次にやること（kaito 10/22 稲生 19）。戦の定義に stages と stageOf があれば左上に出す。
  //   段：「3／6　柴田隊を受け止める」、戦況：一語と細い帯（def.force の残りの割合）、次：今の任務の札の一行。
  //   段が変わる時だけ、真ん中に「第三段　柴田隊を受け止める」を短く出す。毎コマ作らず、字が変わる時だけ書く。
  // 近い敵の頭上に小さな印（▼と「敵」）。四人まで・十四メートルまで。印は使い回し、毎コマ作らない（kaito 10/22 稲生 3）。
  foeMarks(rt) {
    // 目当ての味方一人だけを、実際の姿に小さな名札で示す。名札と投影の入れ物は使い回す。
    const ally = rt.def.missionAlly?.(rt);
    if (ally && !this.missionAllyEl) {
      this.missionAllyEl = document.createElement('div');
      this.missionAllyEl.style.cssText = 'position:absolute;left:0;top:0;padding:2px 5px;background:#17140fe6;color:#fff3df;border-bottom:2px solid #e8c25a;font-size:12px;line-height:1.4;pointer-events:none';
      this.root.appendChild(this.missionAllyEl);
    }
    if (this.missionAllyEl) {
      const e = this.missionAllyEl;
      e.hidden = true;
      if (ally && rt.player.u.alive && !rt.over && !rt.choice && !rt.player.camShot && !this.bigmap &&
          Math.hypot(ally.pos.x - rt.player.u.pos.x, ally.pos.z - rt.player.u.pos.z) <= 40 &&
          !rt.army.wallBetween(rt.player.u.pos, -1, ally.pos)) {
        this.tmpV.set(ally.pos.x, ally.pos.y + (ally.mounted ? 3.1 : 2.3), ally.pos.z).project(rt.camera);
        if (this.tmpV.z < 1 && Math.abs(this.tmpV.x) < .9 && Math.abs(this.tmpV.y) < .85) {
          setText(e, ally === rt.flags.genpachi ? '隊長' : '仲間');
          e.hidden = false;
          e.style.transform = `translate(${Math.round((this.tmpV.x + 1) / 2 * innerWidth)}px,${Math.round((1 - this.tmpV.y) / 2 * innerHeight)}px) translate(-50%,-100%)`;
        }
      }
    }
    this.fieldMarks(rt);
    if (!rt.def.foeMarks) return;
    if (!this.foeEls) {
      this.foeEls = [];
      const box = document.createElement('div'); box.id = 'foe-marks'; box.setAttribute('aria-hidden', 'true');
      box.style.cssText = 'position:absolute;inset:0;pointer-events:none';
      for (let i = 0; i < 4; i++) {
        const e = document.createElement('div');
        e.style.cssText = 'position:absolute;left:0;top:0;transform:translate(-50%,-100%);font-size:12px;line-height:1;color:#f1d9c6;text-shadow:0 1px 2px #000,0 0 4px #000;text-align:center;font-weight:600;letter-spacing:.05em';
        e.innerHTML = '敵<br><span style="color:#c9573d;font-size:14px">▼</span>';
        e.hidden = true; box.appendChild(e); this.foeEls.push(e);
      }
      this.root.appendChild(box);
      this.foeList = [];
    }
    const me = rt.player.u, L = this.foeList; L.length = 0;
    if (me.alive && !rt.over) {
      for (const o of rt.army.units) {
        if (!o.alive || o.team === me.team || o.fleeing || o.gone || o.noTarget || o.isStruct) continue;
        const d = Math.hypot(o.pos.x - me.pos.x, o.pos.z - me.pos.z);
        if (d > 14) continue;
        L.push(o); o._foeD = d;
      }
      L.sort((a, b) => a._foeD - b._foeD);
    }
    const W = innerWidth, H = innerHeight;
    for (let i = 0; i < 4; i++) {
      const e = this.foeEls[i], o = L[i];
      if (!o) { e.hidden = true; continue; }
      this.tmpV.set(o.pos.x, o.pos.y + (o.mounted ? 3.1 : 2.15), o.pos.z).project(rt.camera);
      if (this.tmpV.z > 1 || Math.abs(this.tmpV.x) > 1 || Math.abs(this.tmpV.y) > 1) { e.hidden = true; continue; }
      e.hidden = false;
      e.style.transform = `translate(${Math.round((this.tmpV.x + 1) / 2 * W)}px,${Math.round((1 - this.tmpV.y) / 2 * H)}px) translate(-50%,-100%)`;
    }
  }

  // 初陣の所属は近い二人だけ。札と投影用の点を使い回す。
  fieldMarks(rt) {
    const signs = !rt.over && !this.introWaiting && !this.root.classList.contains('photo') && rt.def.fieldSigns?.(rt);
    if (!signs) { if (this.fieldMarkBox) this.fieldMarkBox.hidden = true; return; }
    if (!this.fieldMarkBox) {
      const box = document.createElement('div'); box.id = 'field-signs';
      box.style.cssText = 'position:absolute;inset:0;pointer-events:none';
      this.fieldMarkEls = [];
      for (let i = 0; i < 2; i++) {
        const el = document.createElement('div');
        el.style.cssText = 'position:absolute;left:0;top:0;padding:2px 5px;background:rgba(12,10,8,.88);border-bottom:2px solid;font-size:12px;line-height:1.4;white-space:nowrap';
        el.style.color = i ? '#ffb6a0' : '#f3e7c5';
        box.appendChild(el); this.fieldMarkEls.push(el);
      }
      this.root.appendChild(box); this.fieldMarkBox = box;
    }
    this.fieldMarkBox.hidden = false;
    let firstX = -1000, firstY = -1000;
    for (let i = 0; i < 2; i++) {
      const el = this.fieldMarkEls[i], sign = signs[i], u = sign?.unit;
      if (!u?.alive || u.gone || u.mesh?.visible === false) { el.hidden = true; continue; }
      this.tmpV.set(u.pos.x, u.pos.y + (u.mounted ? 3.2 : 2.3), u.pos.z).project(rt.camera);
      el.hidden = this.tmpV.z < -1 || this.tmpV.z > 1 || Math.abs(this.tmpV.x) > .85 || Math.abs(this.tmpV.y) > .8;
      if (el.hidden) continue;
      setText(el, sign.label);
      const x = Math.round((this.tmpV.x + 1) / 2 * innerWidth);
      let y = Math.round((1 - this.tmpV.y) / 2 * innerHeight);
      if (i && Math.abs(x - firstX) < 150 && Math.abs(y - firstY) < 26) y -= 28;
      if (y < 84 || x > innerWidth - 240 && y < 150) { el.hidden = true; continue; }
      firstX = x; firstY = y;
      el.style.transform = `translate(${x}px,${y}px) translate(-50%,-100%)`;
    }
  }

  // ミッションの札（kaito 10/23 稲生 1・2）。右に小さく「ミッション 2／4　林の手を崩す」と、進みの点・遊んだ時間・終わりまでの目安。
  //   戦の定義に missions（または stages）と missionOf（または stageOf）があればそれを使う。無い戦は、主の任務が変わるたびに一つ進める。
  //   字が変わる時だけ書く（setText）。毎コマ作らない。
  progress(rt) {
    const def = rt.def, root = this.root;
    if (def.town || def.dojo) { if (this.prog) { this.prog.hidden = true; root.classList.remove('prog-on'); } return; }
    if (!this.prog) {
      const el = document.createElement('div');
      el.id = 'h-prog';
      el.innerHTML = '<div class="pg-st"><b></b><span></span></div><div class="pg-next"></div><div class="pg-dots"></div><div class="pg-time"><i class="pg-pie" hidden></i><span></span></div><div class="pg-context" hidden></div>';
      root.appendChild(el);
      const pop = document.createElement('div');
      pop.id = 'h-stage-pop'; pop.hidden = true; pop.setAttribute('role', 'status');
      root.appendChild(pop);
      const st = document.createElement('style');
      st.textContent = `
#hud.prog-on .tl .plaque { display:none; }
#hud #h-prog { position:absolute; right:calc(16px + env(safe-area-inset-right, 0px)); top:calc(14px + env(safe-area-inset-top, 0px)); box-sizing:border-box; width:min(260px, 30vw); padding:6px 10px; background:rgba(12,10,8,.62); border-right:3px solid var(--kin); color:#fff3df; font-size:max(12px, calc(14px * var(--text-scale, 1))); line-height:1.4; text-align:right; pointer-events:none; }
#hud #h-prog .pg-st b { color:var(--kin); margin-right:.5em; font-weight:600; }
#hud #h-prog .pg-st span { font-weight:600; }
#hud #h-prog .pg-next { margin-top:1px; font-size:max(12px, calc(13px * var(--text-scale, 1))); color:#e6dcc6; }
#hud #h-prog .pg-context { font-size:12px; color:#e6dcc6; }
#hud #h-prog .pg-dots { margin-top:2px; letter-spacing:.2em; color:var(--kin); font-size:12px; }
#hud #h-prog .pg-time { margin-top:1px; font-size:12px; color:#d9cfb8; font-variant-numeric:tabular-nums; display:flex; justify-content:flex-end; align-items:center; gap:6px; }
#hud #h-prog .pg-pie, #hud .tm-pie { display:inline-block; width:16px; height:16px; border-radius:50%; box-shadow:0 0 0 1.5px #c9b27a; background:conic-gradient(#e8c25a calc(var(--p, 0) * 1%), rgba(255,255,255,.12) 0); flex:none; }
#hud #h-prog .pg-pie[hidden] { display:none; }
#hud #h-stage-pop { position:absolute; left:50%; top:30%; transform:translateX(-50%); padding:8px 20px; background:rgba(12,10,8,.82); color:#fff3df; font-family:var(--display); font-size:max(18px, calc(24px * var(--text-scale, 1))); letter-spacing:.08em; pointer-events:none; white-space:nowrap; }
@media (max-height:500px), (pointer:coarse) {
 #hud #h-prog { right:calc(8px + env(safe-area-inset-right, 0px)); top:calc(8px + env(safe-area-inset-top, 0px)); width:min(210px, 26vw); padding:4px 6px; font-size:12px; line-height:1.3; }
 #hud #h-prog .pg-next { font-size:12px; white-space:normal; }
}
#hud #h-prog[data-battle="okehazama"] .pg-next { white-space:normal; overflow:visible; text-overflow:clip; }
#hud.ending #h-prog, #hud:has(#cine.on) #h-prog, #hud:has(#bigmap:not([hidden])) #h-prog { visibility:hidden; }
/* 任務は任務の札にまとめる。右の任務の札は重ねて出さない（台詞の札は残す）。 */
html:root body #hud.prog-on #battle-notices:not(.choosing) #objectives:not(.expand) { display:none !important; }
/* 構えの待ち釦も出さない（構えは自分で判断する。kaito 10/23 稲生 4）。 */
html:root body #hud.prog-on #wait-guard { display:none !important; }
@media (min-height:501px) {
 html:root:not(.touch) body #hud.prog-on #battle-notices:not(.choosing):not(.pg-x) {
  left:auto !important; right:calc(16px + env(safe-area-inset-right, 0px)) !important; top:calc(176px + env(safe-area-inset-top, 0px)) !important;
  bottom:auto !important; width:300px !important; max-height:calc(100% - 320px) !important;
 }
}`;
      root.appendChild(st);
      this.prog = el; this.stagePop = pop;
    }
    const el = this.prog;
    if (el.dataset.battle !== def.key) el.dataset.battle = def.key || '';
    el.hidden = !!rt.over; root.classList.toggle('prog-on', !rt.over);
    const [stEl, nextEl, dotsEl, timeEl, contextEl] = el.children;
    setText(contextEl, def.missionContext || ''); contextEl.hidden = !def.missionContext;
    const list = def.missions || def.stages;
    const task = rt.objectives?.find((o) => o.kind === 'main' && !o.state)?.text || '';
    const taskLine = task.replace(/^使番「|」$/g, '').split(/[。／]/)[0].trim();
    let i, n, title;
    const of = def.missionOf || def.stageOf;
    if (list && of) {
      n = list.length; i = Math.max(0, Math.min(n - 1, of(rt) | 0)); title = list[i];
    } else {
      // 段の無い戦：主の任務が変わるたびに一つ進める（数は分からないので「ミッション 3」とだけ出す）。
      if (this.progRt !== rt) { this.progRt = rt; this.progSeen = []; this.progStage = undefined; }
      if (taskLine && this.progSeen[this.progSeen.length - 1] !== taskLine) this.progSeen.push(taskLine);
      i = Math.max(0, this.progSeen.length - 1); n = 0; title = this.progSeen[i] || '';
    }
    setText(stEl.firstChild, n ? `任務 ${i + 1}／${n}` : `任務 ${i + 1}`);
    setText(stEl.lastChild, title);
    const status = def.missionStatus?.(rt, taskLine) || taskLine;
    const sub = status && status !== title ? status : '';
    setText(nextEl, sub); nextEl.hidden = !sub;
    setText(dotsEl, n ? '●'.repeat(i) + '◉' + '○'.repeat(Math.max(0, n - i - 1)) : ''); dotsEl.hidden = !n;
    const sec = Math.max(0, rt.t | 0), est = (def.minutes || 7) * 60;
    const left = Math.max(1, Math.round((est - sec) / 60));
    setText(timeEl.lastChild, `${(sec / 60) | 0}分${String(sec % 60).padStart(2, '0')}秒　終わりまで 約${left}分`);
    // 待つ間（陣を敷く・寄せを待つ）の残りは、秒の字でなく満ちていく丸で（kaito 10/23 稲生 14）。
    const gm = rt.missionGuide?.marker, wu = gm?.waitUntil?.();
    const pie = timeEl.firstChild, waiting = Number.isFinite(wu) && wu > rt.t && gm.waitDuration > 0;
    pie.hidden = !waiting;
    if (waiting) pie.style.setProperty('--p', String(Math.round(Math.max(0, Math.min(1, 1 - (wu - rt.t) / gm.waitDuration)) * 100)));
    if (this.progStage !== undefined && i !== this.progStage && !rt.over && title) {
      setText(this.stagePop, `任務${i + 1}　${title}`);
      this.stagePop.hidden = false; this.stagePopUntil = rt.t + 2.6;
    }
    this.progStage = i;
    if (!this.stagePop.hidden && rt.t > (this.stagePopUntil || 0)) this.stagePop.hidden = true;
  }


  // 手ほどき・ヒントの札（左の中ほど。携帯の横向きでも隠さない）
  drawCard() {
    coachCss();
    const el = $('tutorial');
    el.classList.add('coach');
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    const h = this.hintCur, t = this.tutCur;
    el.classList.toggle('first-controls', !!t?.auto);
    const firstControl = t?.auto && !t.ok && ['c_swing', 'c_cmd'].includes(t.items.find((x) => !x.done)?.id);
    const guardPractice = t?.auto && !t.ok && t.items.find((x) => !x.done)?.id === 'c_guard';
    // 優先の順：手ほどきの「よし」確認 ＞ ヒント ＞ 手ほどきの段（確認の途中でヒントに取られない）
    let html = '';
    if (this.coachFoe && !guardPractice && !firstControl && !t?.ok) {
      html = '';
    } else if (t && t.ok) {
      const n = t.items.filter((x) => x.done).length;
      const head = `<span class="lbl">${esc(t.title)}<b>${n}/${t.items.length}</b></span>`;
      html = head + `<p class="what ok"><i aria-hidden="true">✓</i>${esc(t.ok)}　よし</p>`;
    } else if (h && !guardPractice && !firstControl) {
      html = `<span class="lbl">手がかり</span><p class="what sm">${keyCaps(h.text)}</p>${h.keys ? `<p class="how">${keyCaps(h.keys)}</p>` : ''}`;
    } else if (t) {
      const n = t.items.filter((x) => x.done).length;
      const it = t.items.find((x) => !x.done);
      const head = `<span class="lbl">${esc(t.title)}<b>${n}/${t.items.length}</b></span>`;
      if (it) html = head + `<p class="what">${esc(it.label)}</p>${it.how ? `<p class="how">${keyCaps(it.how)}</p>` : ''}`;
    }
    const key = html;
    if (key === this.cardKey) return;
    this.cardKey = key;
    el.hidden = !html;
    el.classList.toggle('hintc', !!h && !guardPractice && !t?.ok);
    el.innerHTML = html;
    // 新しい札は少しだけ動かして気づかせる（動きを減らす設定では動かさない）
    if (html) { el.classList.remove('in'); void el.offsetWidth; el.classList.add('in'); }
  }


  // 戦の中の選択
  renderChoice(c) {
    const el = $('choice');
    if (!c) { const restore = el.contains(document.activeElement); el.hidden = true; this.notices.sync(); if (restore) { const target = this.choiceOpener?.isConnected && this.choiceOpener !== document.body ? this.choiceOpener : $('objectives'); target?.focus?.({ preventScroll:true }); } return; }
    this.choiceOpener = document.activeElement;
    el.setAttribute('role', 'group'); el.setAttribute('aria-labelledby', 'choice-title');
    const keyboard = this.keyboardInput;
    const keys = c.options.map((o, i) => i + 1).join(' か ');
    const guide = isTouch ? '押して選ぶ' : `札か数字 ${keys} で選ぶ`;
    const deadline = `${Math.ceil(c.t)}秒後は一番上`;
    const title = c.title === '東に別手。どこを守る？' ? '東に別手。守る所は？' : c.title;
    el.hidden = false;
    el.innerHTML = `<h5 id="choice-title" tabindex="-1">${esc(title)}</h5><p class="choice-help">${guide}・${deadline}</p><span id="choice-seconds" role="status"></span>` + c.options.map((o, i) => `<button type="button" class="opt" data-pick="${i}"><kbd class="cap">${i + 1}</kbd><b>${esc(o.label)}</b><small>${esc(o.note || '')}</small></button>`).join('') + '<div class="tm"><i id="choice-t"></i></div>';
    el.querySelectorAll('[data-pick]').forEach((b) => {
      b.onclick = (e) => { e.stopPropagation(); this.rt?.pickChoice(+b.dataset.pick); };
      b.onkeydown = (e) => {
        e.stopPropagation();
        const pick = Number(e.key) - 1;
        if (/^[1-9]$/.test(e.key) && c.options[pick]) {
          e.preventDefault();
          if (!e.repeat) this.rt?.pickChoice(pick);
        } else if ((e.key === 'Enter' || e.key === ' ') && e.repeat) e.preventDefault();
      };
    });
    el.scrollTop = 0;
    this.choiceMax = c.t;
    if (keyboard) el.querySelector('h5').focus({ preventScroll:true });
    this.notices.sync();
  }

  choiceTime(t) { const b = $('choice-t'); if (b) setWidth(b, Math.max(0, t / (this.choiceMax || 20) * 100)); const secs = $('choice-seconds');
    // 残りは秒の字でなく、満ちていく丸で（kaito 10/23 稲生 14）。読み上げ用に字は残す。
    if (secs) { if (!secs.firstElementChild) secs.innerHTML = '<i class="tm-pie" aria-hidden="true"></i>'; secs.firstElementChild.style.setProperty('--p', String(Math.round(Math.max(0, Math.min(1, 1 - t / (this.choiceMax || 20))) * 100))); secs.setAttribute('aria-label', `残り${Math.max(0, Math.ceil(t))}秒`); } }


  // 操作の早見表（F1）
  toggleCheat() {
    const el = $('cheat');
    el.hidden = !el.hidden;
    if (!el.hidden) el.innerHTML = [['移動', `${K('forward')} ${K('left')} ${K('back')} ${K('right')}`], ['視点', '動かして見回す'], ['突く', '左押し（押すだけ）'], ['構え', '右押しで受ける'], ['避ける', K('dodge')], ['狙い', K('lock')], ['話す・取る', K('use')]].map(([a, b]) => `<div><b>${a}</b>${esc(b)}</div>`).join('');
    if (!el.hidden) {
      el.insertAdjacentHTML('afterbegin', '<h5>操作の早見表</h5><button type="button" class="btn" id="cheat-close" style="min-height:44px;margin-bottom:8px">早見表を閉じる</button>');
      $('cheat-close').onclick = (e) => { e.stopPropagation(); this.toggleCheat(); };
    }
  }
}
