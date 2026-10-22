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

  progress(rt) {
    const def = rt.def, root = this.root;
    if (!def.stages || !def.stageOf) { if (this.prog) { this.prog.hidden = true; root.classList.remove('prog-on'); } return; }
    if (!this.prog) {
      const el = document.createElement('div');
      el.id = 'h-prog';
      el.innerHTML = '<div class="pg-st"><b></b><span></span></div><div class="pg-sit"><span></span><i><s></s></i></div><div class="pg-next"></div><div class="pg-ally"></div>';
      root.appendChild(el);
      const pop = document.createElement('div');
      pop.id = 'h-stage-pop'; pop.hidden = true; pop.setAttribute('role', 'status');
      root.appendChild(pop);
      const st = document.createElement('style');
      st.textContent = `
#hud.prog-on .tl .plaque { display:none; }
#hud #h-prog { position:absolute; left:calc(20px + env(safe-area-inset-left, 0px)); top:calc(16px + env(safe-area-inset-top, 0px)); box-sizing:border-box; width:min(300px, 34vw); padding:6px 10px; background:rgba(12,10,8,.78); border-left:3px solid var(--kin); color:#fff3df; font-size:max(12px, calc(14px * var(--text-scale, 1))); line-height:1.4; }
#hud #h-prog .pg-st b { color:var(--kin); margin-right:.5em; font-weight:600; }
#hud #h-prog .pg-sit { display:flex; align-items:center; gap:8px; margin-top:2px; font-size:max(12px, calc(13px * var(--text-scale, 1))); }
#hud #h-prog .pg-sit i { flex:1; height:6px; background:#5a2a1c; position:relative; }
#hud #h-prog .pg-sit s { position:absolute; left:0; top:0; bottom:0; background:#c9b27a; }
#hud #h-prog .pg-next { margin-top:2px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
#hud #h-prog .pg-next::before { content:'次：'; color:var(--kin); }
#hud #h-prog .pg-ally { margin-top:2px; font-size:max(12px, calc(13px * var(--text-scale, 1))); color:#e6dcc6; }
#hud #h-prog .pg-ally::before { content:'味方：'; color:var(--kin); }
#hud #h-stage-pop { position:absolute; left:50%; top:30%; transform:translateX(-50%); padding:8px 20px; background:rgba(12,10,8,.82); color:#fff3df; font-family:var(--display); font-size:max(18px, calc(24px * var(--text-scale, 1))); letter-spacing:.08em; pointer-events:none; white-space:nowrap; }
@media (max-height:500px), (pointer:coarse) {
 #hud #h-prog { left:calc(8px + env(safe-area-inset-left, 0px)); top:calc(8px + env(safe-area-inset-top, 0px)); width:min(208px, 25vw); padding:4px 6px; font-size:12px; line-height:1.3; }
 #hud #h-prog :is(.pg-sit,.pg-ally) { font-size:12px; }
 #hud #h-prog .pg-ally { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
}
#hud.ending #h-prog, #hud:has(#cine.on) #h-prog, #hud:has(#bigmap:not([hidden])) #h-prog { visibility:hidden; }
@media (min-height:501px) {
 /* 台詞と任務の札は小地図の下へ。上端の両軍の帯・左上の進みと重ねない（kaito 10/22 稲生 4・17）。 */
 html:root:not(.touch) body #hud #battle-notices:not(.choosing):not(.pg-x),
 html:root:not(.touch) body #hud.mission-visible #battle-notices:not(.choosing):not(:has(#objectives.expand)) {
  left:auto !important; right:calc(20px + env(safe-area-inset-right, 0px)) !important; top:calc(200px + env(safe-area-inset-top, 0px)) !important;
  bottom:auto !important; width:300px !important; max-height:calc(100% - 340px) !important;
 }
 html:root:not(.touch) body #hud.single-guide #battle-notices:not(.choosing) #objectives#objectives.route-summary:not(.ground-order):not(.facing-order):not(.enemy-order):not(.expand) {
  position:relative !important; left:auto !important; top:auto !important; transform:none !important; width:100% !important;
 }
 /* 次にやることは左上の一行に出すので、右の任務の札は重ねて出さない。 */
 html:root:not(.touch) body #hud.prog-on #battle-notices:not(.choosing) #objectives:not(.expand) { display:none !important; }
}`;
      root.appendChild(st);
      this.prog = el; this.stagePop = pop;
    }
    const el = this.prog;
    el.hidden = !!rt.over; root.classList.toggle('prog-on', !rt.over);
    const n = def.stages.length, i = Math.max(0, Math.min(n - 1, def.stageOf(rt) | 0));
    const [stEl, sitEl, nextEl, allyEl] = el.children;
    const ally = def.allyDoing?.(rt) || '';
    setText(allyEl, ally); allyEl.hidden = !ally;
    setText(stEl.firstChild, `${i + 1}／${n}`);
    setText(stEl.lastChild, def.stages[i]);
    if (this.progStage !== undefined && i !== this.progStage && !rt.over) {
      const NUM = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
      setText(this.stagePop, `第${NUM[i] || i + 1}段　${def.stages[i]}`);
      this.stagePop.hidden = false; this.stagePopUntil = rt.t + 2.6;
    }
    this.progStage = i;
    if (!this.stagePop.hidden && rt.t > (this.stagePopUntil || 0)) this.stagePop.hidden = true;
    // 戦況：両軍の残りの割合を比べる（def.force が無い戦は帯を出さない）
    const f = def.force?.(rt);
    if (f && f.a0 && f.b0) {
      const a = f.a / f.a0, b = f.b / f.b0, share = a / Math.max(0.001, a + b);
      setText(sitEl.firstChild, share > 0.55 ? '戦況：押している' : share < 0.45 ? '戦況：押されている' : '戦況：五分');
      setWidth(sitEl.querySelector('s'), Math.round(share * 100));
      sitEl.hidden = false;
    } else sitEl.hidden = true;
    const cur = document.querySelector('#obj-list li.cur .obj-now') || document.querySelector('#obj-list li.cur .obj-text');
    // 任務の本文（「ここへ行こう」のような汎用の字でなく、何をするか）に、札の距離（〜歩）だけを添える。
    const task = rt.objectives?.find((o) => o.kind === 'main' && !o.state)?.text || '';
    const steps = (cur?.textContent || '').match(/[^\s・]*?\d+歩/);
    const main = task ? task.replace(/^使番「|」$/g, '').split(/[。／]/)[0] : (cur?.textContent || '').trim();
    const line = main + (steps ? '・' + steps[0] : '');
    setText(nextEl, line);
    nextEl.hidden = !line;
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
      html = `<span class="lbl">ヒント</span><p class="what sm">${keyCaps(h.text)}</p>${h.keys ? `<p class="how">${keyCaps(h.keys)}</p>` : ''}`;
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

  choiceTime(t) { const b = $('choice-t'); if (b) setWidth(b, Math.max(0, t / (this.choiceMax || 20) * 100)); const secs = $('choice-seconds'); if (secs) setText(secs, `残り${Math.max(0, Math.ceil(t))}秒`); }


  // 操作の早見表（F1）
  toggleCheat() {
    const el = $('cheat');
    el.hidden = !el.hidden;
    if (!el.hidden) el.innerHTML = [['移動', `${K('forward')} ${K('left')} ${K('back')} ${K('right')}`], ['視点', 'マウス'], ['突く', '左クリック（押すだけ）'], ['構え', '右クリックで受ける'], ['避ける', K('dodge')], ['狙い', K('lock')], ['話す・取る', K('use')]].map(([a, b]) => `<div><b>${a}</b>${esc(b)}</div>`).join('');
    if (!el.hidden) {
      el.insertAdjacentHTML('afterbegin', '<h5>操作の早見表</h5><button type="button" class="btn" id="cheat-close" style="min-height:44px;margin-bottom:8px">早見表を閉じる</button>');
      $('cheat-close').onclick = (e) => { e.stopPropagation(); this.toggleCheat(); };
    }
  }
}
