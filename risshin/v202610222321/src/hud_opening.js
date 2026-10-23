import { $, esc, setClass, setStyle, setText } from "./hud_common.js";
import { openingGoal, BattleOpening } from "./battle_opening.js";
import { battlePeople, castleWelcome } from "./battle_welcome.js";
import { decorateTerms } from "./glossary.js";
import { reduceMotion, S } from "./settings.js";

export class HudOpening {


  show(on) {
    this.root.hidden = !on;
    if (!on) { clearTimeout(this.flashDefer); this.flashDefer = 0; const cv = $('overlay'); cv.getContext('2d').clearRect(0, 0, cv.width, cv.height); }
  }


  // 開戦の大見出し（◯◯軍 VS ◯◯軍）と上下の黒帯
  intro(sides, name, date) {
    const el = $('intro');
    el.hidden = false;
    // 映画の題の札のように：日付を小さく、戦の名を墨の字で、下に両軍の名を「対」で。派手な色・VS の字は使わない
    this.introWaiting = true;
    const battle = window.__game?.battle, began = performance.now();
    // 年月日と場所は、時間の止まった開戦前に読む。
    date = battle?.def.date?.(battle) || date;
    if (battle?.def.introPlace) date += '　' + battle.def.introPlace;
    const G = window.__game?.G;
    // どの戦も読む時間を取り、自分で出陣を決める。
    const read = this.introRead || G?.battle > 0 || G?.history?.some(Boolean);
    const automatic = !!battle?.startAutomatic;
    const timing = battle?.startTiming;
    const prepared = '「戦いを始める」を押すと始まります。';
    const goal = battle ? openingGoal(battle) : '味方と命令を果たし、生きて戻る';
    this.opening?.dispose();
    this.opening = battle && !battle.def.town && !battle.def.dojo ? new BattleOpening(this, battle) : null;
    if (battle?.firstBattle) {
      // kaito の導入の結びだけを短く見せ、追加の操作は求めない。
      el.innerHTML = '<div class="card"><p>あなたは信長方の足軽として、林勢を追う。</p></div>';
      el.style.pointerEvents = 'none';
      clearTimeout(this.introT);
      this.introT = setTimeout(() => {
        if (window.__game?.battle !== battle || !this.introWaiting || el.hidden) return;
        if (timing) {
          timing.introMs = Math.round(performance.now() - began);
          timing.ready = true; timing.battleSecondsAtReady = battle.t;
          timing.totalMs = timing.loadingMs + (timing.readingMs || 0) + timing.deploymentMs + timing.introMs;
        }
        this.introRead = true;
        try { localStorage.setItem('risshin-intro-read', '1'); } catch (e) { /* 記録できなくても進む */ }
        this.introWaiting = false; el.hidden = true;
        $('cine').classList.remove('on'); this.onIntroReady?.();
      }, automatic ? 0 : 1800);
      return;
    }
    const instruction = battle?.def.introText;
    el.dataset.battle = battle?.def.key || '';
    el.classList.toggle('compact-intro', !!battle?.def.compactIntro);
    const waitText = (typeof instruction === 'function' ? instruction(battle) : instruction) || (read ? '支度ができました。すぐに動けます。' : (battle?.def.teach ? '組の旗と一緒に進もう。操作は一つずつ案内します。' : '組の旗と一緒に進もう。'));
    const waitShown = battle && battle.plainOps && !battle.def.introKeepControls ? battle.plainOps(waitText) : waitText;
    // 開戦の札は軍の名だけ（「出陣時の目安」は兵の数の横で使う言葉）
    const sideName = (n) => String(n || '').replace(/（出陣時の目安）/g, '');
    const openingSide = (side) => sideName(battle?.def.introSides?.[side] || sides[side].name);
    const people = battle?.def.introPeople || battlePeople(battle), castle = castleWelcome(battle);
    const peopleText = people.map((p) => `<div class="intro-person"><b>${esc(p.name)}</b><span>${esc(p.note)}</span></div>`).join('') + (castle ? `<p class="intro-castle">${esc(castle)}</p>` : '');
    const welcome = battle?.def.key === 'moribe' || battle?.def.key === 'okehazama' || battle?.def.key === 'inou'
      ? `<div class="intro-people"><button type="button" class="btn" id="intro-people-toggle" aria-expanded="false" aria-controls="intro-people-body" style="min-height:44px;pointer-events:auto">人物と戦場の説明を読む</button><div id="intro-people-body" hidden>${peopleText}</div></div>`
      : battle?.def.introPeopleFolded && peopleText
        ? `<details class="intro-people"><summary>人物と戦場の説明を読む</summary>${peopleText}</details>` : peopleText;
    for (const person of people) this.peopleIntroduced.add(person.id);
    if (document.pointerLockElement) document.exitPointerLock?.();
    el.innerHTML = `<div class="card" role="dialog" aria-modal="true" aria-labelledby="intro-title" aria-describedby="intro-wait"><div class="intro-reading" tabindex="0" aria-label="戦の下知"><div class="date">${esc(date)}</div><div class="ttl" id="intro-title">${esc(battle?.def.introName || name)}</div><i class="rule" aria-hidden="true"></i><div class="sides">味方　${esc(openingSide('a'))}<em>対</em>敵　${esc(openingSide('b'))}</div><p id="intro-wait" style="font-size:max(15px, calc(15px * var(--text-scale, 1)));line-height:1.6">${esc(waitShown)}</p><p style="font-size:max(15px, calc(15px * var(--text-scale, 1)));line-height:1.6"><b>勝つには：${esc(goal)}</b></p><p style="font-size:max(13px, calc(13px * var(--text-scale, 1)));line-height:1.6">${prepared}${read ? '' : '読む時間は自分で選べます'}</p></div><button type="button" class="btn primary" id="intro-go" style="min-height:48px;pointer-events:auto">出陣する</button></div>`;
    // 札の外は指を受け取らない。出陣待ちの停止は保つ。
    el.querySelector('.sides').innerHTML = `味方　${esc(openingSide('a'))}<em>対</em>敵　${esc(openingSide('b'))}`;
    // 指定した戦では、下知と勝つ条件を読んでから人物紹介へ送る。
    if (battle?.def.introTaskFirst) el.querySelector('.intro-reading').insertAdjacentHTML('beforeend', welcome);
    else el.querySelector('.sides').insertAdjacentHTML('afterend', welcome);
    const peopleToggle = el.querySelector('#intro-people-toggle');
    const peopleReadLabel = battle?.def.key === 'inou' ? '戦いの前の話を読む' : '人物と戦場の説明を読む';
    if (peopleToggle) {
      peopleToggle.textContent = peopleReadLabel;
      // 桶狭間の説明釦は本文の外へ。横長の携帯でも途中で切れず、出陣前に開ける。
      if (battle?.def.key === 'okehazama') el.querySelector('#intro-go').before(peopleToggle);
      for (const name of ['pointerdown', 'pointerup']) peopleToggle.addEventListener(name, e => e.stopPropagation());
      peopleToggle.onclick = e => {
        e.preventDefault(); e.stopPropagation();
        const body = el.querySelector('#intro-people-body'), open = body.hidden;
        body.hidden = !open;
        peopleToggle.setAttribute('aria-expanded', String(open));
        peopleToggle.textContent = open ? '人物と戦場の説明を閉じる' : peopleReadLabel;
        if (open) {
          const reading = el.querySelector('.intro-reading');
          reading.scrollTop += peopleToggle.getBoundingClientRect().top - reading.getBoundingClientRect().top;
        }
      };
    }
    if (battle?.def.key === 'inou' || battle?.def.key === 'moribe' || battle?.def.key === 'okehazama') {
      el.querySelector('#intro-go').insertAdjacentHTML('beforebegin', '<small class="intro-scroll">説明欄は上下に送れます</small>');
    }
    if (battle?.def.key === 'inou') {
      const body = el.querySelector('#intro-people-body');
      const cards = [...body.children];
      let page = 0;
      body.insertAdjacentHTML('afterend', '<div class="intro-pages" hidden><button type="button" class="btn" data-person-prev>前の人物</button><span role="status"></span><button type="button" class="btn" data-person-next>次の人物</button></div>');
      const pages = el.querySelector('.intro-pages');
      el.querySelector('#intro-go').before(pages);
      const showPage = () => {
        cards.forEach((card, i) => { card.hidden = i !== page; });
        pages.querySelector('span').textContent = `${page + 1}／${cards.length}`;
        pages.querySelector('[data-person-prev]').disabled = page === 0;
        pages.querySelector('[data-person-next]').disabled = page === cards.length - 1;
      };
      const toggle = peopleToggle.onclick;
      peopleToggle.onclick = e => {
        toggle(e); pages.hidden = body.hidden;
        el.classList.toggle('people-reading', !body.hidden);
        if (!body.hidden) { showPage(); el.querySelector('.intro-reading').scrollTop = el.querySelector('.intro-reading').scrollHeight; }
      };
      for (const [selector, direction] of [['[data-person-prev]', -1], ['[data-person-next]', 1]]) {
        pages.querySelector(selector).onclick = e => { e.preventDefault(); e.stopPropagation(); page = Math.max(0, Math.min(cards.length - 1, page + direction)); showPage(); };
      }
      showPage();
    }
    if (battle?.def.key === 'okehazama') {
      // 戦場と同じ矢印の形を、最初の下知の横で見せる。
      el.querySelector('#intro-wait').insertAdjacentHTML('afterbegin', '<svg class="intro-pin" viewBox="0 0 80 80" aria-hidden="true"><ellipse cx="40" cy="68" rx="30" ry="9" fill="none" stroke="#fff3ba" stroke-width="5"/><path d="M32 8H48V37H61L40 59L19 37H32Z" fill="#fff3ba" stroke="#14120f" stroke-width="4"/></svg>');
      el.querySelector('#intro-people-body').insertAdjacentHTML('beforeend', '<p>帰りの旗は、義元が倒れた後に仲間が立てる。帰る時も黄色い矢印が旗を示す。</p>');
      if (peopleToggle) {
        const toggle = peopleToggle.onclick;
        peopleToggle.onclick = e => {
          toggle(e);
          if (!el.querySelector('#intro-people-body').hidden) el.querySelector('#intro-people-body').scrollIntoView({ block: 'start' });
        };
      }
    }
    decorateTerms(el.querySelector('.intro-reading'));
    el.style.pointerEvents = 'none';
    $('cine').classList.toggle('on', !reduceMotion());
    clearTimeout(this.introT);
    const go = $('intro-go'), reading = el.querySelector('.intro-reading');
    go.textContent = '戦いを始める';
    go.title = 'この札を閉じ、戦場で動き始める。移動釦でも始められます。';
    go.onclick = (e) => {
      e.stopPropagation();
      if (!this.introWaiting || el.hidden) return;
      if (timing) { timing.introMs = Math.round(performance.now() - began); timing.ready = true; timing.battleSecondsAtReady = battle.t; }
      clearTimeout(this.introT);
      if (!automatic) {
        this.introRead = true;
        try { localStorage.setItem('risshin-intro-read', '1'); } catch (e) { /* 保存の仕組みには触れない */ }
      }
      if (timing) timing.totalMs = timing.loadingMs + (timing.readingMs || 0) + timing.deploymentMs + timing.introMs;
      this.introWaiting = false; el.hidden = true;
      $('cine').classList.remove('on'); go.blur(); this.onIntroReady?.();
    };
    const introKeys = (e) => {
      e.stopPropagation();
      if (e.key === 'Tab') {
        e.preventDefault();
        const targets = [reading, ...el.querySelectorAll('button:not([hidden]), summary')].filter(target => target.getClientRects().length);
        const at = targets.indexOf(document.activeElement);
        targets[(at + (e.shiftKey ? -1 : 1) + targets.length) % targets.length].focus({ preventScroll:true });
      }
      if ((e.key === 'Enter' || e.key === ' ') && e.repeat) e.preventDefault();
    };
    go.onkeydown = reading.onkeydown = introKeys;
    const pages = el.querySelector('.intro-pages');
    if (pages) pages.onkeydown = introKeys;
    go.focus({ preventScroll:true });
    // 自動の試走だけは、操作待ちを省く。
    if (automatic) this.introT = setTimeout(() => { if (this.introWaiting && window.__game?.battle === battle) go.click(); }, 0);
  }


  // 大事な瞬間（名乗り・名のある武将の討死）に、上下の細い黒帯を t 秒だけ（映画の一場面のように）。動きを減らす設定では出さない
  // 開戦の見せ場の間だけ、題の札が出ていても上下の黒い帯を出し、画面の札を消す（cineFlash の 20 秒の間隔とは別）
  shotBars(t = 4.5) {
    if (reduceMotion()) return;
    $('cine').classList.add('on');
    clearTimeout(this.cineT);
    this.cineT = setTimeout(() => $('cine').classList.remove('on'), t * 1000);
  }


  cineFlash(t = 2.5) {
    if (reduceMotion() || !$('intro').hidden) return;
    // 続けて何度も出すと映画の間にならないので、20 秒に一度まで
    const now = performance.now();
    if (now - (this.cineAt || -1e9) < 20000) return;
    this.cineAt = now;
    $('cine').classList.add('on');
    clearTimeout(this.cineT);
    this.cineT = setTimeout(() => { if ($('intro').hidden) $('cine').classList.remove('on'); }, t * 1000);
  }


  reset() {
    this.releaseDodgeHold?.();
    this.releaseCoverHold?.();
    this.counterGuideEnemy = null; this.counterPromptHit = null; this.counterPromptUntil = 0; this.counterPromptAt = -Infinity;
    if (this.coverEl) this.coverEl.hidden = true;
    this.releaseWaitGuard?.();
    if (this.waitGuardButton) this.waitGuardButton.hidden = true;
    setClass(this.root, 'wait-guard-active', false);
    this.opening?.dispose(); this.opening = null;
    this.root.classList.add('battle-active');
    setClass(this.root, 'dodge-active', false);
    setClass(this.root, 'dodge-turn-coach', false);
    if (this.dodgeEl) setStyle(this.dodgeEl, 'display', 'none');
    window.speechSynthesis?.cancel();
    setText($('h-merit'), '戦の最中');
    this.introWaiting = false; clearTimeout(this.introT);
    this.hurtT = 0; this.threatAt = 0; this.damageDirectionUntil = 0;
    $('vignette').classList.remove('hurt', 'side', 'dying', 'winded');
    $('vignette').style.removeProperty('--hx'); $('vignette').style.removeProperty('--hy');
    for (const id of ['dmgdir', 'mobfx', 'aimwarn', 'brinkfx', 'encircle']) { const el = $(id); if (el) { el.classList.remove('on', 'show'); } }
    const cards = $('sonae-cards'); if (cards) cards.hidden = true;
    this._scKey = ''; this._scAlert?.clear();
    this.orderLog = []; this.warningLog = []; this.resultNotices = []; this.allyReport = '';
    this.logEntry.hidden = true;
    this.deepWas = false; this.breathHelp = false; this.moraleHelp = false; this.killHelp = false;
    $('h-squad').setAttribute('aria-expanded', 'false');
    this.subQ = []; this.subT = 0; this.shownLine = null; this.coachFoe = false; this.nearFoe = false; this.nearFoeT = 0; this.objKey = ''; this.taskShownId = null; this.taskShownText = ''; this.taskShownAt = -99; this.goalSignalAt = -99; this.curObjKey = null; this.shownGoalKey = null; this.goalFlashUntil = 0; this.log = []; this.doneAt = new Map(); this.subDrop = false;
    this.armyGhost = null; this.moveMarks = []; this.unitsKey = ''; this.radialKey = ''; this.rt = null;
    // 道筋・人物・旗の案内も戦全体を参照する。次の戦の支度へ持ち越さない。
    this.doorwaySight = this.approachRoute = this.singleGoalWay = this.guardWait = null;
    this.peopleRt = this.peopleUnits = this.ovRt = this.flagRt = this.flagMarker = this.dodgeTurnRt = null;
    this.goalFlag = this.goalFlagFoot = this.goalFlagOwner = this.attackGuideEnemy = this.approachGuideEnemy = null;
    for (const list of [this.peopleCandidates, this.bossCandidates, this.bossOffscreen, this.ovCand, this.ovOffscreen]) if (list) list.length = 0;
    this.enemyOrderKey = this.approachOrderKey = null;
    this.aimGuideEnemy = null;
    setClass($('objectives'), 'approach-order', false);
    setClass($('objectives'), 'enemy-order', false);
    setClass($('objectives'), 'enemy-move-help', false);
    this.guardAlly = this.lastGuardAlly = this.defendEnemy = this.guardThreat = null;
    this.guardPromptAt = -Infinity; this.guardPromptUntil = 0; this.guardPromptAttack = null;
    this.retreatGuide = null; this.travelGuide = null; this.retreatScanAt = 0; this.guardFacing = false;
    this.retreatGestureActive = this.retreatGestureDone = false; this.retreatGestureRt = null;
    setClass(this.root, 'guard-button-help', false);
    this.mmT = this.unitsT = this.firstHelpT = this.siegeCardsT = this.compassT = 0; this.periodicNext = 0; this.markersF = 0;
    if ($('h-units')) $('h-units').hidden = true;
    if (this._scEl) { this._scEl.hidden = true; setStyle(this._scEl, 'display', 'none'); }
    this.armyKey = ''; this.armyScan = null;
    this.armyClock = 0;
    this.bannerQ = []; this.bannerT = 0; this.bannerEndingRt = null; this.lastToast = null;
    this.peopleIntroduced = new Set(); this.peopleScanAt = 0;
    this.barkSeen = new Map(); this.barkCounts = new Map(); this.barkTimes = [];
    this.nextHintAt = -99;
    this.commandPlace = null;
    this.hintCur = null; this.tutCur = null; this.cardKey = ''; clearTimeout(this.hintTimer); clearTimeout(this.hintDefer);
    if (this.staminaLabel) this.staminaLabel.hidden = true;
    for (const id of ['subtitle', 'toasts', 'markers', 'bark', 'threats']) $(id).innerHTML = '';
    this.markerEls.clear();
    this.threatEls = [];
    this.threatSizes = [];
    // 危険が迫ったコマで札を作らず、出陣の支度中に三枚用意する。
    for (let i = 0; i < 3; i++) {
      const el = document.createElement('div');
      el.className = 'threat edge'; el.hidden = true;
      el.style.cssText = 'transform:translate(-50%,-50%);font-size:15px;color:#30251b;background:linear-gradient(100deg,#d6c5a3,#eee0bf 48%,#d6c5a3);padding:4px 8px;border:0;border-left:3px solid #843c2b;border-radius:2px;text-shadow:none;font-family:var(--display);text-align:center';
      $('threats').appendChild(el); this.threatEls.push(el);
      this.threatSizes.push({ width: 0, height: 0, left: 0, right: 0, top: 0, bottom: 0 });
    }
    this.threatRects.length = 0;
    this.workHoldId = null;
    this.workPromptKey = '';
    for (const id of ['cmdpanel', 'prompt', 'bigmap', 'hint', 'sublog', 'target', 'flash', 'intro', 'armybar', 'radial', 'combo', 'killmark', 'staring', 'skiphint', 'situation', 'maphint', 'cheat', 'tutorial', 'choice']) $(id).hidden = true;
    $('floats').innerHTML = ''; this.floats = [];
    this.ghost = undefined; this.calmT = 0;
    this.rtsCardKey = ''; this.rtsOrdKey = ''; this.rtsFormOpen = false; this.hideRts();
    $('cine').classList.remove('on');
    this.bigmap = false;
    $('banner').classList.remove('show');
    $('objectives').classList.remove('expand');
    $('obj-list').setAttribute('aria-expanded', 'false');
    $('obj-list').setAttribute('aria-label', '任務の一覧を開く');
    $('objectives').setAttribute('aria-label', '今の任務。押すとほかの任務を開く');
    this.alliesOpen = false;
    this.notices.reset();
    this.applySettings();
  }


  applySettings() {
    this.root.dataset.sub = S.subSize;
    // HUD の部品ごとの出し入れ
    for (const [k, cls] of [['hudMinimap', 'no-minimap'], ['hudCompass', 'no-compass'], ['hudArmy', 'no-army'], ['hudSquad', 'no-squad'], ['hudBottom', 'no-bottom'], ['hudObjectives', 'no-objectives']]) this.root.classList.toggle(cls, !S[k]);
    document.body.classList.toggle('mincho', S.fontBody === 'mincho');
    document.body.classList.toggle('ca', !!S.colorAssist);
    // 動きを減らす：ゲームの設定か、OS の「視差効果を減らす」
    document.body.classList.toggle('rm', reduceMotion());
    $('fps').hidden = !S.showFps;
  }
}
