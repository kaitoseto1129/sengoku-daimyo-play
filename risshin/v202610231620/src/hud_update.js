import { fieldSignsTick } from "./field_signs.js";
import { setClass, $, brushImage, esc, setHidden, setStyle, leanHud, guidanceEnded, setText, setHtml, subtitlePage, setAttr, setCssVar, retreatRequired, setWidth, moraleWord, tensionCss, singleBattleGuide, shortTask, fieldLabel, taskLabel, guardPostDistance, attackOperation, treatmentGuideText, retreatGuideText, rescueTarget, groundFlag, recovering, woundRetreat, combatTask, travelSignPriority, dismountFirst, treatmentRequired, defenseRadius, progressRatio, destinationDistance, taskDetail, RESCUE_SIGN, ENEMY_SIGN, setListRows, stackBottomLeft, shortcutKey } from "./hud_common.js";
import { terrainHints, isRtsOn } from "./rts.js";
import { sightUnit, woundHint, sightScreenUnit, groupSeen, numberHint } from "./battle_sight.js";
import { enemyKnown, intelText } from "./battle_intel.js";
import { VIEW } from "./viewport.js";
import { sfx, speaking } from "./audio.js";
import { S, K } from "./settings.js";
import { battleSpeechAllowed, noOps } from "./speech_clean.js";
import { isTouch, touchInput, touchMoveLearned } from "./touch.js";
import { rankLabel } from "./state.js";
import { woundText } from "./wounds.js";
import { updateMissionPin, pinGuideOn } from "./mission_pin.js";
import { currentObjective, destinationText, taskText, navigationEnemy, goalText } from "./mission_guide.js";
import { rainDanger } from "./arrow_rain.js";
import { groundAt } from "./floors.js";
import { simpleControls } from "./simple_controls.js";
import { ORDER_NAME, GROUP_NAME, FORM_NAME, commandList, SQUAD_FORMS } from "./player.js";

export class HudUpdate {


  update(dt, rt) {
    if (window.__apx && window.__apx.nohud) return;   // 実機の試し：札を書かない（外の時間が DOM の配置かを見る）
    this.rt = rt;
    this.openingControls(dt, rt);
    fieldSignsTick(rt, this.root);   // 敵の▼・武将の名と体力の棒（全戦）
    setClass(this.root, 'field-clean', pinGuideOn(rt));
    const missionOnly = !rt.def.town && !rt.def.dojo;
    setClass(this.root, 'mission-only', missionOnly);
    setClass(this.root, 'honnoji', rt.def.key === 'honnoji');
    setClass(this.root, 'iwamura', rt.def.key === 'iwamura');
    setClass(this.root, 'takato', rt.def.key === 'takato');
    setClass(this.root, 'mitsukuri', rt.def.key === 'mitsukuri');
    const p = rt.player;
    const u = p.u;
    const G = rt.G;
    // 見出し
    this.opening?.update(dt);
    const periodic = this.periodicReady(dt);
    if (periodic & 64) terrainHints(rt);   // 地形の支度も待ち順に入れ、他の定期仕事と重ねない。
    if (periodic & 16) this.preparePeople(rt);
    // 敵将の札も、画面へ戻ったコマで候補へ戻す。
    else if (this.bossOffscreen) for (let i = this.bossOffscreen.length - 1; i >= 0; i--) {
      const unit = this.bossOffscreen[i];
      if (unit.offscreen) continue;
      this.bossCandidates.push(unit); this.bossOffscreen.splice(i, 1);
    }
    // 途中から登場する武将も、見えた時に一度だけ。既存の三枠と八秒の間隔を使う。
    if (rt.t >= this.peopleScanAt && !rt.over && $('intro').hidden) {
      this.peopleScanAt = rt.t + 1;
      for (const unit of this.peopleCandidates || []) {
        const person = this.peopleNames.get(unit.name);
        if (!person || this.peopleIntroduced.has(person.id) || !unit.alive || !sightUnit(rt, unit) || unit.team !== 0 && !enemyKnown(rt, unit)) continue;
        if (unit.pos.distanceToSquared(rt.player.u.pos) > 900) continue;
        this.peopleIntroduced.add(person.id);
        this.banner(unit.name, person.note);
        break;
      }
    }
    this.notices.update(dt);
    if (this.notices.visible('banner')) this.bannerT -= dt;
    if (this.bannerT <= 0) setClass($('banner'), 'show', false);
    if (rt) for (let i = this.bannerQ.length - 1; i >= 0; i--) if (this.bannerQ[i].phase !== rt.phase) this.bannerQ.splice(i, 1);
    while (this.bannerQ.length && this.notices.clock - this.bannerQ[0].at > 8) this.bannerQ.shift();
    while (this.bannerQ.length && !this.notices.repeatOk(this.bannerQ[0].sub ? this.bannerQ[0].text + '\n' + this.bannerQ[0].sub : this.bannerQ[0].text)) this.bannerQ.shift();
    // 開戦の題の札が出ている間は、見出しを待たせる（重ねない）
    // 判断の札（#choice）が開いている間も待たせる（札の上に見出しが重なって読めなかった。見回り 10/2）
    if (this.bannerT <= 0 && this.bannerQ.length && $('intro').hidden && $('choice').hidden && this.notices.room(80) && this.notices.repeatOk(this.bannerQ[0].sub ? this.bannerQ[0].text + '\n' + this.bannerQ[0].sub : this.bannerQ[0].text, true)) {
      const { text, sub, phase } = this.bannerQ.shift();
      this.bannerPhase = phase;
      const b = $('banner');
      b.classList.remove('show'); void b.offsetWidth;
      setClass(b, 'down-reason', !!rt.def.downReasonBanner && (text === '重傷' || text === '討死'));
      b.innerHTML = `<span class="brush" style="background-image:url(${brushImage()})">${esc(text)}</span>` + (sub ? `<small>${esc(sub)}</small>` : '');
      b.classList.add('show');
      this.bannerT = 2.6;
      this.notices.sync();
    }
    // 手ほどきの札は 40 秒たったら小さな札に畳む（視界を塞がない。A015）
    { const tu = $('tutorial'); if (tu) setClass(tu, 'tutold', rt.t > 40 && !this.hintCur && !this.tutCur); }
    // 目に入る兵の気配の数（上の帯）は一秒に二回で足りる（毎コマ全ての兵の見通しを調べると重い）
    if (periodic & 32) this.updateArmy(rt);   // 見通しの集計も小分けにし、完成した時だけ帯へ渡す。
    // 戦の画面では方角の帯・縄張りの札・備えの札・野戦の帯を作らない（出さない物は作らない。kaito 10/23）。
    const fieldOnly = pinGuideOn(rt);
    if (fieldOnly) for (const el of [this._scEl, document.getElementById('sonae-cards'), document.getElementById('yasen-hud')]) { if (el && !el.hidden) el.hidden = true; }
    if (!fieldOnly && (this.siegeCardsT = (this.siegeCardsT || 0) - dt) <= 0) { this.siegeCardsT = 0.1; this.updateSiegeCards(rt); }
    this.updateArmyGhost(dt);
    this.drawOverlay(rt);
    if (isRtsOn(rt)) this.updateRts(rt); else this.hideRts();
    // 方角の帯は毎コマ作り直さなくても気付かれない（字と印を毎コマ組み立て直すのが重かった）。十回/秒で足りる
    if (!fieldOnly && (this.compassT = (this.compassT || 0) - dt) <= 0) { this.compassT = 0.1; this.updateCompass(rt); }
    this.updateRadial(rt);
    if (!fieldOnly) { this.sonaeCards(rt); this.yasenHud(rt); }
    // 城下：どこから出陣すればよいか迷わないよう、右下に常の「出陣する」釦を置く
    setClass(this.root, 'battle-active', !rt.def.town);
    setClass(this.root, 'anegawa', rt.def.key === 'anegawa');
    setClass(this.root, 'echizen', rt.def.key === 'echizen');
    setClass(this.root, 'okawachi', rt.def.key === 'okawachi');
    setClass(this.root, 'arioka', rt.def.key === 'arioka');
    setClass(this.root, 'shitaragahara', rt.def.key === 'shitaragahara');
    setClass(this.root, 'pursuit-order', rt.def.key === 'shitaragahara' && !!rt.flags.chaseOrdered && !rt.flags.ending);
    setClass(this.root, 'okehazama', rt.def.key === 'okehazama');
    setClass(this.root, 'tennoji', rt.def.key === 'tennoji');
    setClass(this.root, 'tottori', rt.def.key === 'tottori');
    setClass(this.root, 'iwamura', rt.def.key === 'iwamura');
    setClass(this.root, 'quiet-orders', !!rt.def.quietOrders);
    setClass(this.root, 'quiet-combat-cues', !!rt.def.quietCombatCues);
    setClass(this.root, 'compact-battle', VIEW.h <= 500 && !rt.def.town && !rt.def.dojo);
    const sortie = $('town-sortie');
    if (sortie) {
      const show = !!(rt.def && rt.def.town);
      if (sortie.hidden === show) setHidden(sortie, !show);
      if (show && !sortie.__wired) { sortie.__wired = true; sortie.onclick = () => { sfx('ui'); rt.game.townOpen('boss', { go: true }); }; }
    }
    // 浮かぶ戦功
    if (this.floats) {
      for (let i = this.floats.length - 1; i >= 0; i--) {
        const f = this.floats[i];
        f.t += dt;
        if (f.t > 1.4) { f.el.remove(); this.floats.splice(i, 1); continue; }
        if (f.el.hidden || this.root.classList.contains('photo')) continue;
        const sp = this.project(f.pos, (f.pos.y || 0) + 2.6 + f.t * 0.8, rt);
        setStyle(f.el, "left", sp.x + 'px'); setStyle(f.el, "top", sp.y + 'px');
        setStyle(f.el, "opacity", sp.behind ? 0 : Math.min(1, (1.4 - f.t) * 2));
      }
    }
    // 平時は周りの札を薄くし、戦いになったらはっきり
    // 敵が 35m 以内に来たら、斬り合う前から札を戻す（0.5 秒ごとに見る）
    this.nearFoeT = (this.nearFoeT || 0) - dt;
    if (this.nearFoeT <= 0) { this.nearFoeT = 0.5; this.nearFoe = !!(u.alive && rt.army.nearestEnemy && rt.army.nearestEnemy(u, 35, (o) => !o.fleeing && o.type !== 'dummy')); }
    const coachFoe = this.nearFoe || p.inCombatT > 0 || (rt.army.threats || []).length > 0;
    setClass(this.root, 'combat-brief', coachFoe && !rt.def.town && !rt.def.dojo);
    // 携帯の接敵中は指示・目標・体力の三つ。地図や号令を開けば詳細へ戻す。
    setClass(this.root, 'combat-three', isTouch && coachFoe && !rt.def.town && !rt.def.dojo &&
      !p.cmdOpen && !p.radial && !this.bigmap && !rt.choice && !this.openingActive &&
      !rt.over && !p.camShot && !rt.dodgeGuide && !retreatRequired(rt) &&
      !this.retreatGuide?.active && !recovering(rt) && !this.guardAlly &&
      !rainDanger(rt.army) && !rt.nearestInteract() &&
      (!this.waitGuardButton || this.waitGuardButton.hidden));
    if (this.coachFoe !== coachFoe) { this.coachFoe = coachFoe; this.drawCard(); }
    const busy = p.inCombatT > 0 || (rt.army.threats || []).length > 0 || p.cmdOpen || p.radial || this.nearFoe;
    this.calmT = busy ? 0 : (this.calmT || 0) + dt;
    // HUD の段（S.hudMode）：'min' 最小＝平時は 2 秒で札を消し、任務・小地図・方角も引っ込める／'full' 全部＝薄めない／無ければ「ふつう」
    const mode = S.hudMode || 'normal';
    setClass(this.root, 'combat-focus', coachFoe && rt.t > 8 && mode !== 'full' && S.hudAutoFade
      && !rt.def.town && !rt.def.dojo && !p.cmdOpen && !p.radial && !this.bigmap && !rt.choice && !this.openingActive);
    setClass(this.root, 'calm', mode !== 'full' && S.hudAutoFade && this.calmT > (mode === 'min' ? 2 : 6));
    setClass(this.root, 'hudmin', mode === 'min');
    setClass(this.root, 'lean', leanHud());
    // 戦が決まった後（勝ち・負け・重傷）は、札を引っ込めて、引いていくカメラの絵と字幕だけにする
    setClass(this.root, 'ending', !!guidanceEnded(rt));
    // 必要な時だけ出す札：両軍の兵力の帯と日付は、開戦・形勢が変わった時・号令や地図を開いている間だけ（HUD の三つの層の「要る時」）
    this.armyPeekT = (this.armyPeekT || 0) - dt;
    const peek = !S.hudAutoFade || rt.t < 8 || this.armyPeekT > 0 || p.cmdOpen || p.radial || this.bigmap || rt.ended;
    // 兵力の帯は戦の間ずっと出す（平時は薄くするだけ。peek は号令・地図の間に濃くするのに使う）
    setClass(this.root, 'army-off', false);
    setClass(this.root, 'army-peek', peek);
    // 初めての戦の手ほどきの間は、方角の帯と小地図を出さない（札は戦功・任務・体力・手ほどきだけで始める）
    setClass(this.root, 'novice', !!(rt.tut?.auto || rt.tutPause?.t.auto) && !this.bigmap);
    setClass(this.root, 'date-off', S.hudAutoFade && rt.t > 8 && !this.bigmap && !p.cmdOpen);
    setClass(this.root, 'hc', !!S.hudContrast);
    setClass(this.root, 'subbg', !!S.subBg);
    // 気力の輪（使っているときだけ照準のそばに）
    const spacedCombatCues = rt.def.spacedCombatCues || rt.def.key === 'iwamura' || rt.def.key === 'takato' || rt.def.key === 'shiga' || rt.def.key === 'saika' || rt.def.key === 'okawachi';
    setClass(this.root, 'spaced-combat-cues', spacedCombatCues);
    const ring = $('staring');
    if (!this.staminaLabel) {
      const label = this.staminaLabel = document.createElement('span');
      label.className = 'combat-cue-label stamina-cue';
      label.style.cssText = 'position:absolute;left:calc(50% - 52px);top:calc(50% + 14px);font-size:12px;color:#ece4d2;background:#14120f;padding:2px 4px;pointer-events:none';
      ring.after(label);
    }
    setText(this.staminaLabel, rt.def.staminaLabel || '気力');
    // 戦の画面では気力の輪と字を出さない（出たり消えたりでちらつく。kaito 10/23）。
    const staOff = pinGuideOn(rt);
    setHidden(this.staminaLabel, staOff || p.sta / p.maxSta > .98 || rt.over);
    const sr = p.sta / p.maxSta;
    setHidden(ring, staOff || sr > 0.98 || rt.over);
    const ringPct = String(Math.round(sr * 100));
    if (ring.style.getPropertyValue('--p') !== ringPct) ring.style.setProperty('--p', ringPct);
    setClass(ring, 'low', p.sta < 20);
    // 飛ばせる場面の案内
    const sk = $('skiphint');
    // 初めての手ほどきの間は出さない（札は一度に一つ。待ちを飛ばすと手ほどきの間が無くなる）
    // 敵が近い間も出さない（物見と突き合う最中に「飛ばす」が真ん中に出ると、誤って押す）
    if ((this.skipFoeT = (this.skipFoeT || 0) - dt) <= 0) { this.skipFoeT = 0.25; this.skipFoe = !!rt.army.nearestEnemy(p.u, 25, (o) => !o.fleeing && o.type !== 'dummy'); }
    const can = !(rt.tut && rt.tut.auto) && !rt.tutPause && (!this.skipFoe || rt.over && rt.tracker.main === true) && rt.def.canSkip && rt.def.canSkip(rt);
    setHidden(sk, !can);
    if (can) setHtml(sk, `<kbd>${K('skip')}</kbd>${esc(can)}`);
    // 戦況の一行
    const st = $('situation');
    setHidden(st, true); // 全軍の内部集計から優劣を断定しない。
    // 字幕
    // 開戦の題の札の間は、字幕を待たせる（札の後に頭から読めるように）
    const introOn = !$('intro').hidden;
    if (this.shownGoalKey && this.shownGoalKey !== rt.missionGuide?.key) { this.subT = 0; this.shownGoalKey = null; window.speechSynthesis?.cancel(); }
    if (this.subT > 0 && !introOn && this.notices.visible('subtitle')) this.subT -= dt;
    if (this.subT > 0 && this.shownLine && (this.taskRepeats(this.shownLine.speaker, this.shownLine.text) || !battleSpeechAllowed(rt, this.shownLine.speaker, this.shownLine.text, this.shownLine.speakerUnit))) { this.subT = 0; this.shownLine = null; window.speechSynthesis?.cancel(); setHtml($('subtitle'), ''); }
    while (this.subQ.length && (!battleSpeechAllowed(rt, this.subQ[0].speaker, this.subQ[0].text, this.subQ[0].speakerUnit) || this.taskRepeats(this.subQ[0].speaker, this.subQ[0].text) || this.subQ[0].goalKey && this.subQ[0].goalKey !== rt.missionGuide?.key || !this.notices.repeatOk(this.subQ[0].text))) this.subQ.shift();
    const continuation = this.subT <= 0 && this.shownLine?.remaining &&
      (!this.shownLine.goalKey || this.shownLine.goalKey === rt.missionGuide?.key) &&
      !this.taskRepeats(this.shownLine.speaker, this.shownLine.text) &&
      battleSpeechAllowed(rt, this.shownLine.speaker, this.shownLine.text, this.shownLine.speakerUnit);
    if (this.subT <= 0 && !introOn && this.notices.room(70) &&
      (continuation || this.subQ.length && this.notices.repeatOk(this.subQ[0].text, true))) {
      const s = continuation ? this.shownLine : this.subQ.shift();
      const [page, remaining] = subtitlePage(s.speaker, continuation ? s.remaining : s.text, rt.def.key === 'honnoji' && !s.speaker);
      s.remaining = remaining;
      const duration = Math.max(3, s.dur * page.length / Math.max(1, s.text.length), 1.2 + page.length * .11);
      this.shownLine = s;
      this.shownGoalKey = s.goalKey;
      s.shown = true;
      s.t = Math.floor(rt.t);
      // 話し手ごとに色を変える（上官・名のある人は金、自分は白、足軽は灰、敵は朱）
      // 敵か味方かは、話し手の名の家と、戦場にいるその名の者の陣営で決める
      const foeStem = rt.def.sides && rt.def.sides.b && rt.def.sides.b.name ? rt.def.sides.b.name.replace(/軍$/, '') : '';
      const foe = s.speaker && ((foeStem && s.speaker.includes(foeStem)) || (rt.def.foeNames || []).some((n) => s.speaker.includes(n)) || rt.army.groups.some((g) => g.team !== 0 && g.name && g.name !== '町の人' && s.speaker.includes(g.name)) || rt.army.units.some((o) => o.name && o.team !== 0 && (o.name === s.speaker || o.name.endsWith(s.speaker))));
      const sc = !s.speaker ? '' : s.speaker === rt.G.name ? 'me' : foe ? 'foe' : /足軽|伝令/.test(s.speaker) ? 'grunt' : 'lord';
      const pageHtml = rt.def.key === 'honnoji' && !s.speaker
        ? esc(page).replace(/本能寺|（油小路蛸薬師）|天正十年六月二日|夜明け前/g, word => `<span class="place-word">${word}</span>`)
        : rt.def.town
          ? (page.match(/[^。！？]+[。！？]?|[。！？]/g) || []).map(sentence => `<span class="town-sentence">${esc(sentence)}</span>`).join('')
        : esc(page);
      setHtml($('subtitle'), (s.speaker ? `<span class="sp ${sc}">${esc(rt.def.key === 'okehazama' ? s.speaker.replace(/隊長/g, 'たいちょう').replace(/槍組/g, 'やりの組').replace(/侍大将/g, '兵をまとめる武将').replace(/足軽/g, '歩いて戦う兵').replace(/伝令|使番/g, '知らせを運ぶ兵') : s.speaker)}</span>` : '') + `<span class="${s.speaker ? '' : 'sys'}">${pageHtml}</span>` +
        (this.subDrop ? `<small class="more">台詞を一部とばしました（${isTouch ? '字幕を押すと会話の記録' : `<kbd class="cap">${esc(K('log').replace(/^文字([上中下])段(\d+)$/, '文字釦の$1段、左から$2番目'))}</kbd> で会話の記録`}）</small>` : ''));
      if (!this.subQ.length) this.subDrop = false;
      if (s.speaker) speaking(duration);
      // 戦の声（war_speech.js）が同じ言葉を言えたら、読み上げの声は重ねない。
      if (continuation || !rt.warSpeech?.line(s.speaker, s.text, s.speakerUnit, this.canSpeak(s.speaker))) this.speak(s.speaker, page);
      // 畳まれていた時間は数えず、読む時間を確保する。
      this.subT = duration;
      this.notices.sources[3].born = this.notices.clock;
    } else if (this.subT <= 0) setHtml($('subtitle'), '');
    // ゲージ
    // 戦の画面は命の棒だけ。名・字・士気の帯は出さない（kaito 10/23「無駄なものが多すぎる」）。
    const fieldBars = pinGuideOn(rt);
    setHidden($('h-who'), fieldBars);
    if (!fieldBars) setHtml($('h-who'), `${esc(rt.def.key === 'moribe' && G.name === '弥五郎' ? '弥五郎（やごろう）' : G.name)}<small>${esc((rt.def.key === 'okehazama' || rt.def.key === 'moribe') ? rankLabel(G).replace(/足軽/g, 'あしがる（歩いて戦う兵）').replace(/侍大将/g, 'さむらいだいしょう（兵をまとめる武将）') : rankLabel(G))}</small>`);
    const hpEl = $('h-hp');
    const hpPct = Math.max(0, Math.min(100, u.hp / u.maxHp * 100));
    const fallen = !u.alive || u.hp <= 0;
    // 生きている間は切り捨てで零にせず、倒れた時と区別する。
    const hpShown = fallen ? 0 : Math.max(1, Math.floor(hpPct));
    if (!this.hpRemaining || this.hpRemaining.parentElement !== hpEl) {
      this.hpRemaining = document.createElement('b');
      this.hpRemaining.className = 'hp-remaining';
      hpEl.appendChild(this.hpRemaining);
    }
    // 名前と数字を残し、色や棒だけに頼らず残量を伝える。
    setText(this.hpRemaining, fieldBars ? '♥ 体力' : `♥ 体力 ${hpShown}％`);
    setHidden(this.hpRemaining, false);
    setAttr(this.hpRemaining, 'aria-label', `命 あと${hpShown}％`);
    const hpTrack = hpEl.querySelector('i');
    setAttr(hpTrack, 'role', 'progressbar');
    setAttr(hpTrack, 'aria-label', '自分の残りの命');
    setAttr(hpTrack, 'aria-valuemin', 0);
    setAttr(hpTrack, 'aria-valuemax', 100);
    setAttr(hpTrack, 'aria-valuenow', hpShown);
    // 一本の太い塗りを実際の残量に合わせる。
    if (!this.hpFill || this.hpTrack !== hpTrack) {
      this.hpTrack = hpTrack;
      hpTrack.innerHTML = '<strong></strong>';
      this.hpFill = hpTrack.firstElementChild;
    }
    // 数字と塗りは同じ残量。枠内の塗りは、親の配置や高さの割合に依存させない。
    setCssVar(hpTrack, '--hp-ratio', hpPct / 100);
    setAttr(hpTrack, 'aria-valuetext', fallen ? '倒れた' : `残り${hpShown}％`);
    const tcLow = isTouch && document.documentElement.classList.contains('tc-low');
    const emEl = hpEl.querySelector('em');
    // 軽いけがも命の表示へまとめ、同じ知らせは八秒あける。
    if (this.injuryRt !== rt) { this.injuryUntil = 0; this.injuryNextAt = 0; }
    if (this.injuryRt === rt && u.alive && !rt.over && u.hp < this.injuryHp - .1 && rt.t >= this.injuryNextAt) {
      this.injuryUntil = rt.t + 1.2; this.injuryNextAt = rt.t + 8;
    }
    this.injuryRt = rt; this.injuryHp = u.hp;
    const recentInjury = u.alive && !rt.over && rt.t < this.injuryUntil;
    const bloodLoss = !fallen && u.wounds?.bleed > 0.0001;
    const deep = u.hp < u.maxHp * 0.3;
    const woundEffectMin = rt.def.woundEffectMin ?? 0;
    const slowWound = u.woundSlow > woundEffectMin;
    const wound = woundText(u).replace('胴', '体').replace('腿', 'もも').replace('の骨の傷', 'の骨に けが').replace('に傷', 'に けが');
    const wounded = fallen || bloodLoss || deep || slowWound || u.armWound > woundEffectMin || !!wound;
    const injury = fallen ? '倒れた' : bloodLoss ? '血が出てる' : deep ? '命が少ない' : wound;
    const woundEffect = !fallen && (slowWound || u.armWound > woundEffectMin)
      ? rt.def.woundEffectText?.(rt, slowWound) ?? (slowWound ? '足のけが' : '腕のけが') : '';
    const footSign = '<svg viewBox="0 0 32 36" aria-hidden="true"><path d="M13 3H24L21 22L29 27V33H7V25L11 19Z" fill="currentColor"/><path d="M10 14L23 18M9 19L22 23" stroke="#14120f" stroke-width="3"/></svg>';
    const effect = woundEffect ? `${slowWound ? footSign : ''}${esc(woundEffect)}` : '';
    const injurySign = bloodLoss ? '<svg viewBox="0 0 32 36" aria-hidden="true"><path d="M16 2C13 9 4 17 4 24A12 12 0 0 0 28 24C28 17 19 9 16 2Z" fill="currentColor"/></svg>' : deep ? '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M4 4L28 28M10 2L30 22M2 10L22 30" fill="none" stroke="currentColor" stroke-width="4"/></svg>' : '';
    // 命の札には状態だけを書き、退く操作は案内一枚に任せる。
    const shortInjury = fallen ? injury : deep ? '命が少ない' : bloodLoss ? '血が出てる' : '';
    const flee = !fallen && !rt.over && retreatRequired(rt) && !p.treatmentReady &&
      !(this.retreatGuide?.active && this.retreatGuide.valid &&
        Math.hypot(this.retreatGuide.x - u.pos.x, this.retreatGuide.z - u.pos.z) < this.retreatGuide.radius);
    // 傷は命の札へ、退く指示は行き先に結ぶ任務札へ置く。
    setHtml(emEl, !fallen && deep ? 'あと少し！' : VIEW.h <= 500 ? esc(shortInjury) : fallen ? esc(injury) : deep || bloodLoss ? injurySign + esc(injury) + (effect ? `<small>${effect}</small>` : '') : recentInjury ? esc(shortInjury) : effect || esc(injury));
    setClass(hpEl, 'healthy', hpPct >= 100 && !wounded);
    setClass(hpEl, 'blood-loss', bloodLoss);
    // 危険は同じ体力の札へ常時添える。繰り返す一時の知らせは作らない。
    setHidden(emEl, !fallen && !deep);
    if (tcLow) setStyle(emEl, "fontWeight", '800');
    // 深手（三割を切る）は言葉でも示す。
    setClass(hpEl, 'deep', deep);
    setClass(hpEl, 'bleeding', u.alive && !rt.over && u.hp < 40 && u.wounds?.bleed > 0.0001 && !S.reduceMotion);
    this.deepWas = deep;
    setText(hpEl.querySelector('span'), fieldBars ? '' : 'いのち');
    setHidden(hpEl.querySelector('span'), fieldBars);
    // 他の帯の省略判定は保ち、命だけは満ちていても見せる。
    const bl = hpEl.parentElement;
    if (bl) setClass(bl, 'full', u.hp >= u.maxHp && p.sta >= p.maxSta * 0.98 && (!p.canRide || p.horseHp >= p.horseMax * 0.98));
    const staEl = $('h-sta');
    setWidth(staEl.querySelector('b'), Math.max(0, p.sta / p.maxSta * 100));
    // 気力で足を遅くしないので、気力の棒と「息切れ」「疲れ」は出さない（kaito 10/22・main 8fc110a79）。
    setText(staEl.querySelector('em'), '');
    setClass(staEl, 'low', false);
    setHidden(staEl, true);
    // 気力の棒は減った時だけ（満ちていれば照準のそばの輪も消えている）
    setClass(staEl, 'full', p.sta >= p.maxSta * 0.98);
    let moraleSum = 0;
    for (const g of rt.squadGroups) moraleSum += Math.max(0, g.morale);
    const mor = rt.squadGroups.length ? moraleSum / rt.squadGroups.length : rt.hostGroup ? Math.max(0, rt.hostGroup.morale) : 100;
    const morEl = $('h-mor');
    setHidden(morEl, fieldBars);
    setWidth(morEl.querySelector('b'), mor);
    const plainMorale = rt.def.key === 'inou' || rt.def.key === 'okehazama' || rt.def.key === 'moribe';
    setText(morEl.querySelector('span'), plainMorale ? 'やる気' : '士気');
    setText(morEl.querySelector('em'), plainMorale ? mor >= 75 ? 'やる気十分' : mor >= 50 ? '落ち着いている' : mor >= 30 ? 'こわがっている' : '逃げ出しそう' : moraleWord(mor));
    setClass(morEl, 'low', mor < 40);
    if (mor < 40 && !this.moraleHelp && !rt.over) { this.moraleHelp = true; this.notices.push('組が動揺している。号令が届いても動きが鈍ることがある', 85, 5); }
    // 馬の体力と息（馬に乗れる身分から）
    const hEl = $('h-horse'), bEl = $('h-breath');
    // 馬の札は乗っている時か、馬が傷ついた・逃げた時だけ
    const horseNote = p.canRide && (p.mounted || p.horseHp < p.horseMax * 0.98 || (p.loose && (p.loose.mode === 'fled' || p.loose.mode === 'flee')));
    setHidden(hEl, !horseNote); setHidden(bEl, !p.canRide || !p.mounted);
    if (p.canRide) {
      const away = !p.mounted && p.loose && (p.loose.mode === 'fled' || p.loose.mode === 'flee');
      setText(hEl.querySelector('span'), p.horseName);
      setWidth(hEl.querySelector('b'), Math.max(0, p.horseHp / p.horseMax * 100));
      setText(hEl.querySelector('em'), p.mounted ? p.horseHp < p.horseMax * 0.3 ? '深手' : p.horseHp < p.horseMax ? '手傷' : '' : away ? '逃げた・呼べない' : '待っている');
      setClass(hEl, 'low', p.horseHp < p.horseMax * 0.3);
      setWidth(bEl.querySelector('b'), Math.max(0, p.breath / p.maxBreath * 100));
      setText(bEl.querySelector('em'), p.horse?.userData.horse?.exhausted ? '疲れ・並足だけ' : p.breathRest || p.breath <= 5 ? '息切れ・並足で休む' : p.breath < p.maxBreath * 0.25 ? '息が残り少ない' : p.horseHp < p.horseMax * 0.5 ? '傷で足が鈍い' : '落ち着いている');
      setClass(bEl, 'low', p.breathRest || p.breath < p.maxBreath * 0.25);
    }
    // 戦功と次の身分
    this.rank = G.rank; this.hasSquad = rt.squad.length > 0;
    let groupCount = 0;
    for (const g of rt.squadGroups) if (g.count > 0) groupCount++;
    this.manyGroups = groupCount > 1;
    setText($('h-merit'), rt.over ? '戦の終わり' : '戦の最中');
    this.progress(rt);
    updateMissionPin(rt);
    // 戦の画面では、打たれた向きの「！」・狙われた時と囲まれた時の縁の脈を出さない（出たり消えたりする。kaito 10/23）。
    const quietEdges = pinGuideOn(rt);
    this.foeMarks(rt);
    setText($('h-next'), '');
    setWidth($('h-nextbar'), 0);
    setText($('h-cap'), '');
    // 攻撃元は小さい「！」。行き先と同じ矢印にせず、言葉は八秒あける。
    const damageDirection = $('dmgdir');
    const showDamageDirection = !quietEdges && u.alive && !rt.over && !rt.choice && !this.openingActive &&
      !p.camShot && !this.bigmap && rt.t < (this.damageDirectionUntil || 0);
    if (this.damageWordRt !== rt) {
      this.damageWordRt = rt; this.damageWordNext = 0; this.damageWordUntil = 0;
    }
    if (showDamageDirection && rt.t >= this.damageWordNext) {
      this.damageWordNext = rt.t + 8;
      this.damageWordUntil = Math.min(this.damageDirectionUntil, rt.t + 1.8);
    }
    const damageWord = showDamageDirection && rt.t < this.damageWordUntil;
    setClass(damageDirection, 'on', showDamageDirection);
    setClass(damageDirection, 'has-word', damageWord && !singleBattleGuide(rt));
    setText(damageDirection, damageWord && !singleBattleGuide(rt) ? '攻撃' : '');
    setAttr(damageDirection, 'aria-label', '攻撃が来た方');
    if (showDamageDirection) {
      rt.camera.getWorldDirection(this.tmpV);
      const angle = this.damageDirectionYaw - Math.atan2(this.tmpV.x, this.tmpV.z);
      setStyle(damageDirection, 'left', `${50 - Math.sin(angle) * 40}%`);
      setStyle(damageDirection, 'top', `${50 - Math.cos(angle) * 30}%`);
      setStyle(damageDirection, 'transform', 'translate(-50%,-50%)');
    }
    // 被弾
    if (this.hurtT > 0) this.hurtT -= dt;
    setClass($('vignette'), 'hurt', this.hurtT > 0 || u.hp < u.maxHp * 0.3);
    // 息が上がった時（気力が一割半を切る）：画面の縁がゆっくり暗く脈打つ（気力の棒を見なくても分かる）
    setClass($('vignette'), 'winded', u.alive && p.sta < p.maxSta * 0.15 && !(this.hurtT > 0));
    // 深手（三割を切る）：視界の端がにじみ、色が抜け、鼓動に合わせて赤く脈打つ。敵の鉄砲に狙われている間は縁が赤く脈打つ
    tensionCss();
    setClass($('vignette'), 'dying', u.alive && u.hp < u.maxHp * 0.3);
    // 囲まれた時：画面の左右の縁が墨でじわりと狭まる（字を出さずに、下がれ・抜けろと伝える）
    let mob = $('mobfx');
    if (!mob) { mob = document.createElement('div'); mob.id = 'mobfx'; mob.setAttribute('aria-hidden', 'true'); $('vignette').after(mob); }
    setClass(mob, 'on', !quietEdges && !!(u.alive && u.mobbed && (rt.army.threats || []).some((o) => sightUnit(rt, o))));
    let aw = $('aimwarn');
    if (!aw) { aw = document.createElement('div'); aw.id = 'aimwarn'; $('vignette').after(aw); }
    setClass(aw, 'on', !quietEdges && u.alive && (rt.army.threats || []).some((o) => sightUnit(rt, o) && (o.type === 'gun' || o.type === 'bow')) && !rt.over);
    // 囲み：敵のいる向きの画面の縁が赤黒く染まる（前＝上・後ろ＝下。囲まれつつある時だけ）
    this.encT = (this.encT || 0) - dt;
    if (this.encT <= 0) {
      this.encT = 0.1;
      let ec = $('encircle');
      if (!ec) { ec = document.createElement('div'); ec.id = 'encircle'; $('vignette').after(ec); }
      const E = rt.encircle, on = false; // 全周の内部集計は知らせない。小地図には見える囲みだけ残す。
      setClass(ec, 'on', on);
      if (on) {
        const N = E.sec.length, yaw = p.yaw || 0, st = [];
        for (let j = 0; j < N; j++) {
          // 画面の j 番目の向き（上から時計回り）→ 世界の向き → その向きの敵の数
          const a = -(j * 2 * Math.PI / N) + yaw;
          const w = ((a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
          const c = E.sec[Math.min(N - 1, Math.floor(w / (2 * Math.PI) * N))];
          const al = c >= 2 ? Math.min(0.75, 0.25 + c * 0.06) : 0;
          st.push(al);
        }
        // 向きの境は硬く切らず、隣の向きへ墨がにじむように（向きの真ん中どうしを滑らかにつなぐ）
        const ink = (a) => `rgba(64,10,4,${a.toFixed(2)})`, wrap = (st[0] + st[N - 1]) / 2;
        let stops = '';
        for (let j = 0; j < st.length; j++) stops += (j ? ', ' : '') + `${ink(st[j])} ${((j + 0.5) * 360 / N).toFixed(1)}deg`;
        setStyle(ec, 'background', `conic-gradient(from ${(-180 / N).toFixed(2)}deg, ${ink(wrap)} 0deg, ${stops}, ${ink(wrap)} 360deg)`);
      }
    }
    // 照準
    const ch = $('crosshair');
    setAttr(ch, 'data-style', S.crosshair);
    setClass(ch, 'inrange', p.inRange);
    let rangeCue = ch._rangeCue;
    if (!rangeCue) { rangeCue = document.createElement('span'); rangeCue.className = 'range-cue'; ch.appendChild(rangeCue); ch._rangeCue = rangeCue; }
    const rangeText = '';   // 「兵に届く」「一歩寄ると届く」は出さない（kaito 10/18「いらない」）
    // 近寄りの案内は近い敵がいる時だけ。任務や台詞には重ねない。
    // この文は、武器の届く距離から一歩以内に敵がいる時だけ作られる。
    const approachMuted = (rangeText === '一歩寄ると届く' &&
      (this.notices.visible('objectives') || this.notices.visible('subtitle'))) ||
      (isTouch && VIEW.h <= 500 && (!!rt.nearestInteract() ||
        (this.notices.picks.length >= 2 && !!rt.missionGuide?.marker)));
    const cueTarget = p.rangeCueTarget;
    const cueOffscreen = !spacedCombatCues && cueTarget && (cueTarget.offscreen || cueTarget.mesh?.visible === false);
    setHidden(rangeCue, !rangeText || approachMuted || cueOffscreen);
    const rangeLabel = rangeText.replace('兵に届く', '敵に届く');
    if (rangeCue.textContent !== rangeLabel) rangeCue.textContent = rangeLabel;
    // 岩村・高遠は照準の上に固定。ほかの戦は頭の脇へ、投影用の入れ物を使い回す。
    if (!rangeCue.hidden && !spacedCombatCues && cueTarget && cueTarget.alive) {
      const head = cueTarget.human?.bones?.Head || cueTarget.head;
      if (head) { head.getWorldPosition(this.tmpV); this.tmpV.y += 0.2; }
      else this.tmpV.set(cueTarget.pos.x, cueTarget.pos.y + (cueTarget.mounted ? 3.1 : 1.9) * (cueTarget.mesh?.scale.y || 1), cueTarget.pos.z);
      this.tmpV.project(rt.camera);
      const x = (this.tmpV.x * 0.5 + 0.5) * VIEW.w, y = (-this.tmpV.y * 0.5 + 0.5) * VIEW.h;
      setHidden(rangeCue, !rangeText || approachMuted || this.tmpV.z < -1 || this.tmpV.z > 1 || Math.abs(this.tmpV.x) > 1 || Math.abs(this.tmpV.y) > 1);
      setStyle(rangeCue, 'position', 'fixed');
      const sizeKey = rangeText + ':' + VIEW.w + ':' + VIEW.h;
      if (this.rangeCueSizeKey !== sizeKey && !rangeCue.hidden) {
        this.rangeCueSizeKey = sizeKey; this.rangeCueWidth = rangeCue.offsetWidth || 112;
      }
      const width = this.rangeCueWidth || 112;
      const left = x < VIEW.w / 2 ? x + 36 : x - width - 36;
      let top = y - 10;
      // 田野の肩越し視点では気力の輪・照準・連撃の周りを空ける。
      // 頭の脇の札が中央へ入る時だけ下へ避け、ほかの戦の配置は保つ。
      if (rt.def.rangeCueClearCenter && left < VIEW.w / 2 + 100 && left + width > VIEW.w / 2 - 100 &&
          top < VIEW.h / 2 + 56 && top + 28 > VIEW.h / 2 - 40) top = VIEW.h / 2 + 64;
      setStyle(rangeCue, "left", `${Math.max(8, Math.min(VIEW.w - width - 8, left))}px`);
      setStyle(rangeCue, "top", `${Math.max(8, Math.min(VIEW.h - 28, top))}px`);
      setStyle(rangeCue, "transform", 'none');
    } else if (rangeCue.style.position) {
      setStyle(rangeCue, 'position', ''); setStyle(rangeCue, "left", ''); setStyle(rangeCue, "top", ''); setStyle(rangeCue, "transform", '');
    }
    setClass(ch, 'guard', p.guard);
    setClass(ch, 'counter', p.counterT > 0);
    setClass(ch, 'charge', !!p.charging);
    setClass(ch, 'charged', p.chargeT > 0.7);
    // 鉄砲：照準を小さな輪に。縁は込め直しの進み、込め終えて構えたら金の輪（撃てる合図）
    const gunOn = p.weapon === 'gun';
    setClass(ch, 'gun', gunOn);
    if (gunOn) {
      const ready = !!p.gunLoaded;
      setClass(ch, 'gaim', (p.aimK || 0) > 0.5);
      setClass(ch, 'gready', ready);
      setCssVar(ch, '--rl', `${Math.round((ready ? 1 : p.gunReload || 0) * 100)}%`);
      if (ready && !this.gunReadyWas) { ch.classList.remove('gping'); void ch.offsetWidth; ch.classList.add('gping'); }
      this.gunReadyWas = ready;
    } else this.gunReadyWas = true;
    // 金の輪にも意味を添える。札は一つだけ作り、状態に応じて字を替える。
    if (!this.crosshairLabel) {
      const label = this.crosshairLabel = document.createElement('span');
      label.className = 'combat-cue-label';
      label.style.cssText = 'position:absolute;left:calc(50% + 24px);top:calc(50% - 32px);font-size:12px;line-height:1.4;color:#ece4d2;background:#14120f;padding:2px 4px;pointer-events:none';
      ch.after(label);
    }
    const cue = gunOn ? p.gunLoaded ? '撃てる' : '弾を込める' : p.counterT > 0 ? '打ち返せる' : p.charging ? p.chargeT > 0.7 ? '突きを溜めた' : '突きを溜める' : '';
    if (this.crosshairLabel.textContent !== cue) this.crosshairLabel.textContent = cue;
    setHidden(this.crosshairLabel, !cue || rt.over);
    // 近くに敵の武将がいれば、画面上部に大きく名前と体力
    const boss = $('boss');
    let bu = null, bd = 30;
    for (const o of this.bossCandidates || []) {
      // 名のある敵（武将と名のある侍）。討たれない武将も、手傷で退くまでは体力を見せる（当たっているかが分かるように）
      if (o.offscreen || !o.alive || o.team === 0 || o.woundOut || !sightUnit(rt, o) || !enemyKnown(rt, o)) continue;
      const d = Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z);
      // 敵将の札は、名乗りの直後・狙っている時・すぐそば（14m）にいる時だけ
      if (d > 14 && p.lock !== o && !(o.announced && (o.annT ??= rt.t) + 6 > rt.t)) continue;
      if (d < bd) { bd = d; bu = o; }
    }
    const duel = rt.army.duel;
    if (duel && !duel.foe.offscreen && sightUnit(rt, duel.foe) && enemyKnown(rt, duel.foe)) bu = duel.foe;
    // 敵将の札がある時は、同じ高さの戦況の一行を隠す
    if (bu) setHidden($('situation'), true);
    // 近くで見える敵将の構えと傷だけ。
    if (bu && !rt.def.routeGuidePriority?.(rt) && !rt.guideEnemyShown && !rt.dodgeGuide && !retreatRequired(rt) && !this.retreatGuide?.active && rt.missionGuide?.marker?.guideArea !== 'retreat') {
      // 傷は見えた手応えだけを言葉にする。残り体力や退く下限は知らせない。
      const stance = duel && bu === duel.foe ? rt.army.time < duel.naT ? '敵が名乗った' : duel.bind ? '敵と押し合い' : duel.openT > rt.army.time ? '敵にすきあり' : bu.atk && bu.atk.heavy ? '敵が強く打つ' : bu.guarding > 0 ? '敵がかまえた' : rt.def.duelStanceText || '敵と一騎打ち' : '';
      setHidden(boss, missionOnly);
      setClass(boss, 'field-boss', true);
      const at = this.project(bu.pos, bu.pos.y + (bu.mounted ? 3.3 : 2.35), rt);
      const off = at.behind || at.x < 80 || at.x > VIEW.w - 80 || at.y < 90 || at.y > VIEW.h - 64;
      const angle = Math.atan2(bu.pos.x - u.pos.x, bu.pos.z - u.pos.z) - p.yaw - (p.camYawOff || 0);
      const arrow = off ? Math.cos(angle) < -.5 ? '↓' : Math.sin(angle) > 0 ? '←' : Math.sin(angle) < 0 ? '→' : '↑' : '';
      setClass(boss, 'edge', off);
      setClass(boss, 'symbol-only', singleBattleGuide(rt) && !duel);
      setHtml(boss, singleBattleGuide(rt) && !duel ? `<span aria-hidden="true">${arrow}▼</span>` : `<span>${arrow}敵の大将${stance ? `<br>${esc(stance)}` : ''}</span>`);
      setCssVar(boss, 'left', `${off ? VIEW.w / 2 - Math.sin(angle) * (VIEW.w / 2 - 88) : at.x}px`, 'important');
      setCssVar(boss, 'top', `${Math.max(90, Math.min(VIEW.h - 72, off ? VIEW.h / 2 - Math.cos(angle) * (VIEW.h / 2 - 90) : at.y - 12))}px`, 'important');
      setAttr(boss, 'aria-label', `敵の大将。${stance || (bu.atk ? '敵が打ってくる' : bu.guarding > 0 ? '敵がかまえた' : bu.lastHitT < 5 ? woundHint(bu) : '構えて防げ')}`);
    }
    else setHidden(boss, true);
    // 狙っている敵
    const tg = $('target');
    const a = p.lock?.alive ? p.lock : p.aimed;
    // 狙いの札は、名のある者・侍・武将か、狙い定めた時だけ（平の足軽は頭の上の棒で足りる）
    if (a && !a.offscreen && !rt.def.routeGuidePriority?.(rt) && !retreatRequired(rt) && !this.retreatGuide?.active && !rt.dodgeGuide && !rt.guideEnemyShown && !rt.def.objectiveEnemies?.(rt)?.length && !(rt.missionGuide?.marker && /旗|組の列/.test(rt.missionGuide.label)) && a.alive && a.team !== u.team && !a.noTarget && sightUnit(rt, a) && (!a.isOfficer || enemyKnown(rt, a)) && (p.lock || Math.hypot(a.pos.x - u.pos.x, a.pos.z - u.pos.z) < 9)) {
      setHidden(tg, false);
      setClass(tg, 'locked', !!p.lock);
      setClass(tg, 'field-target', true);
      const at = this.project(a.pos, a.pos.y + (a.mounted ? 3.3 : 2.35), rt);
      setStyle(tg, 'left', Math.max(64, Math.min(VIEW.w - 64, at.x)) + 'px');
      setStyle(tg, 'top', Math.max(64, Math.min(VIEW.h - 64, at.y - 48)) + 'px');
      setHtml(tg, '<span aria-hidden="true">ねらう敵</span>');
      setAttr(tg, 'aria-label', '狙っている敵');
      if (at.behind) setHidden(tg, true);
    } else setHidden(tg, true);
    if (!this.victoryLabel) {
      this.victoryLabel = document.createElement('div');
      this.victoryLabel.className = 'victory-condition';
      $('objectives').prepend(this.victoryLabel);
      this.actionLabel = document.createElement('div');
      this.actionLabel.className = 'battle-action';
      this.actionLabel.hidden = true;
      this.actionLabel.addEventListener('pointerdown', (e) => e.stopPropagation());
      this.actionLabel.addEventListener('keydown', (e) => {
        if (e.target.closest('button')) e.stopPropagation();
      });
      this.actionLabel.addEventListener('click', (e) => {
        if (!e.target.closest('.dismount-action')) return;
        e.stopPropagation();
        const rt = this.rt;
        if (rt && !rt.choice && !rt.over && rt.player.mounted) rt.player.toggleMount();
      });
      $('objectives').prepend(this.actionLabel);
    }
    setText(this.victoryLabel, `勝つには：${rt.victoryText()}`);
    setHidden(this.victoryLabel, !!rt.def.town || !!rt.def.dojo);
    setClass(this.root, 'mission-visible', !rt.def.town && !rt.def.dojo && !rt.over);
    setClass($('objectives'), 'goal-changed', rt.t < (this.goalFlashUntil || 0));
    // 任務
    // 済んだ任務は 8 秒見せたら畳んで「済 n」にまとめる（今やる事を埋もれさせない）
    this.doneAt = this.doneAt || new Map();
    for (const o of rt.objectives) if (o.state === 'done' && !this.doneAt.has(o.id + o.text)) this.doneAt.set(o.id + o.text, rt.t);
    const folded = this.foldedObjectives || (this.foldedObjectives = []); folded.length = 0;
    for (const o of rt.objectives) if (o.state === 'done' && rt.t - this.doneAt.get(o.id + o.text) > 8) folded.push(o);
    // 案内の半秒ごとの更新を待たず、札は現在の任務から選ぶ。
    // 次の下知まで間が空いても、畳んだ済の札だけになって欄が空にならないようにする。
    this.waitObjective ||= { id: '_wait', kind: 'guide', text: '組のそばで構え、次の下知を待て', state: '' };
    setClass($('objectives'), 'task-details', !!rt.def.taskDetails);
    setClass($('objectives'), 'keep-combat-task', !!rt.def.keepCombatTask);
    setClass($('objectives'), 'keep-guard-task', !!rt.def.keepTaskWithGuard);
    setClass($('objectives'), 'keep-dodge-task', !!rt.def.keepTaskWithDodge);
    const goalObjective = currentObjective(rt) || (!rt.over && !rt.def.town && !rt.def.dojo ? rt.missionGuide?.waitObjective || this.waitObjective : null);
    const guide = rt.missionGuide?.objective === goalObjective ? rt.missionGuide : null;
    const filler = goalObjective && !rt.objectives.includes(goalObjective) ? goalObjective : null;
    // 同じ任務の細かな言い換えは十秒待つ。済・失敗・次の任務はすぐ反映する。
    if (goalObjective && (goalObjective.id !== this.taskShownId || (rt.def.immediateTaskChanges && goalObjective.text !== this.taskShownText) || (rt.def.immediatePhaseTasks && this.taskShownPhase !== rt.phase) || rt.t - (this.taskShownAt ?? -99) >= 10)) {
      this.taskShownId = goalObjective.id; this.taskShownText = goalObjective.text; this.taskShownAt = rt.t;
      this.taskShownPhase = rt.phase;
    }
    if (!goalObjective) this.taskShownId = null;
    // 戦ごとの短い案内と、共通・各戦のやさしい言い換えを両方反映する。
    let shownTaskLabel = goalObjective ? shortTask(fieldLabel(destinationText(rt, taskText(rt, taskLabel(rt, this.taskShownText || goalObjective.text))))) : '';
    if (!rt.def.keepTaskLabel && rt.guideEnemyShown && rt.guideEnemy?.alive &&
        !(rt.def.key === 'okehazama' && rt.phase === 'assault' && rt.flags.entered && !rt.flags.victory)) {
      shownTaskLabel = 'この敵を たおす';
    } else if (!rt.def.keepTaskLabel && rt.guideEnemyDirection) {
      shownTaskLabel = 'あの旗へ すすめ';
    } else if (/この敵を\s*たおす/.test(shownTaskLabel)) {
      shownTaskLabel = 'この敵を たおす';
    }
    if (!singleBattleGuide(rt) && !rt.def.keepGuardTaskLabel && rt.guideEnemyShown && rt.guideEnemy?.alive && /敵.*止め|敵.*押し返/.test(shownTaskLabel)) {
      const distance = Math.hypot(rt.guideEnemy.pos.x - p.u.pos.x, rt.guideEnemy.pos.z - p.u.pos.z);
      shownTaskLabel = distance > 3 ? `近づいて とめよう・約${Math.ceil(distance / .75)}歩` : 'すきに つこう';
    }
    if (!rt.def.keepTaskLabel && rt.guideEnemyShown && rt.guideEnemy?.alive && /この.*てき|この敵|敵.*止め|敵.*押し返/.test(shownTaskLabel)) shownTaskLabel = 'この敵を たおす';
    if (!rt.def.keepTaskPanel && this.attackGuideEnemy?.alive && this.guardFacing) shownTaskLabel = 'この敵を たおす';
    const waitingOrder = !!guide?.marker && (guide.marker.guideArea === 'wait' || guide.marker.guideArea === 'guard' || !!guide.marker.waitGuide) && !rt.guideEnemyShown;
    if (waitingOrder) {
      const reached = (guide.marker.guideArea === 'guard' ? guardPostDistance(rt, guide) : guide.distance) < (guide.marker.guideRadius || 8);
      shownTaskLabel = (rt.def.keepWaitOrderLabel && rt.def.waitOrderLabel?.(rt, reached)) ||
        (!reached ? guide.marker.guideArea === 'guard' ? 'ここへ進め' : '旗まで すすむ' : rt.def.waitOrderLabel?.(rt, reached) ||
        'ここで待とう');
    }
    setClass($('objectives'), 'wait-order', waitingOrder);
    const atWait = guide?.marker?.waitAction && guide.distance < (guide.marker.guideRadius || 8) && !rt.guideEnemyShown;
    const waitUntil = atWait ? guide.marker.waitUntil?.() : null;
    const timedWait = rt.def.key !== 'anegawa' && Number.isFinite(waitUntil) && waitUntil > rt.t && !rt.dodgeGuide &&
      !retreatRequired(rt) && !this.retreatGuide?.active && !rainDanger(rt.army);
    setClass($('objectives'), 'timed-wait', timedWait);
    if (timedWait) setCssVar($('objectives'), '--wait-progress',
      `${Math.round(Math.max(0, Math.min(1, 1 - (waitUntil - rt.t) / (guide.marker.waitDuration || 1))) * 100)}%`);
    if (atWait) {
      shownTaskLabel = timedWait ? '敵の寄せを待つ' :
        '味方と並んで待つ';
    }
    // 構えの操作と案内は使わない。持ち場と救助の位置だけ判定する。
    const rescue = rescueTarget(rt);
    const rescueNear = !!rescue && rt.def.guardGuideAllowed?.(rt) !== false &&
      Math.hypot(rescue.pos.x - u.pos.x, rescue.pos.z - u.pos.z) < 3.5 &&
      Math.abs(rescue.pos.y - u.pos.y) < 1.5 && !rt.army.wallBetween(u.pos, -1, rescue.pos);
    const guardDistance = guide?.marker?.guideArea === 'guard' ? guardPostDistance(rt, guide) : guide?.distance;
    const outsideGuardPost = guide?.marker?.guideArea === 'guard' && guardDistance >= (guide.marker.guideRadius || 8);
    const waitGuard = false, releaseReady = false;
    if (this.retreatGuide?.active && this.retreatGuide.valid && this.retreatGuide.treatment)
      shownTaskLabel = treatmentGuideText(rt, this.retreatGuide);
    else if (retreatRequired(rt) || this.retreatGuide?.active && this.retreatGuide.valid && !this.retreatGuide.treatment || guide?.marker?.guideArea === 'retreat') shownTaskLabel = retreatGuideText(rt, this.retreatGuide?.active && this.retreatGuide.valid && Math.hypot(this.retreatGuide.x - rt.player.u.pos.x, this.retreatGuide.z - rt.player.u.pos.z) < this.retreatGuide.radius, 'にげる場所');
    else if ((!rt.def.keepRescueTaskLabel || rt.def.rescueGuideTarget?.(rt)) && (rescueTarget(rt) || this.guardAlly || (rt.def.guardGuideTarget?.(rt) || rt.def.guardTarget?.(rt))?.alive) && rt.def.guardGuideAllowed?.(rt) !== false) {
      const guard = this.guardAlly || rt.def.guardGuideTarget?.(rt) || rt.def.guardTarget?.(rt);
      shownTaskLabel = rescueTarget(rt) ? rescueNear ? 'そばで 敵からまもる' : 'この人に 近づこう' : rt.def.guardLabel?.(rt, guard) || 'この人を守れ';
    }
    // 移動中でも目前の斬り合いを先に教える。札は既存の一枚を使う。
    if (!rt.def.keepTaskLabel && !rt.def.routeGuidePriority?.(rt) && navigationEnemy(rt) && !rainDanger(rt.army) && !rt.dodgeGuide && !retreatRequired(rt) &&
        !this.retreatGuide?.active && !this.guardAlly && !rescueTarget(rt) && !(rt.def.guardGuideTarget?.(rt) || rt.def.guardTarget?.(rt))?.alive && !waitGuard) {
      shownTaskLabel = isTouch ? `「${p.weapon === 'sword' ? 'きる' : 'つく'}」を押して はなす` : '左押しで 攻撃';
    }
    if (/^道の旗へすすもう$/.test(shownTaskLabel)) shownTaskLabel = 'この旗へ';
    else if (/^(旗へ行け|この旗へ|この旗へ進め|旗へ進む|旗まで進む)$/.test(shownTaskLabel)) shownTaskLabel = '旗へ進もう';
    // 行き先と歩数を同じ一行へ。到着判定は元の持ち場の半径に合わせる。
    const flagTravel = groundFlag(guide) && !rt.guideEnemyShown && !rt.dodgeGuide &&
      !retreatRequired(rt) && !this.retreatGuide?.active && !rainDanger(rt.army);
    const flagSteps = flagTravel ? Math.ceil((guide.distance - (guide.marker.guideRadius || 8)) / .75) : 0;
    if (flagTravel && flagSteps > 0 && (!rt.def.keepFlagTravelTask || /旗.*(?:へ|戻|下が)/.test(shownTaskLabel)) && !rt.def.hideGuideSteps) shownTaskLabel = rt.def.flagTravelLabel?.(rt, shownTaskLabel, flagSteps) || `旗まで あと${flagSteps}歩`;
    else if (flagTravel && !rt.def.keepFlagArrivalTask && /敵.*止め/.test(shownTaskLabel)) shownTaskLabel = 'ここで とまろう';
    // 歩数は既存の任務札へ。向きは地上の一本の矢印で示す。
    const unifiedDestination = !recovering(rt) && !!guide?.marker && singleBattleGuide(rt) &&
      (flagTravel && flagSteps > 0 && !waitingOrder || guide.marker.guideTalk) && !rt.dodgeGuide &&
      !retreatRequired(rt) && !this.retreatGuide?.active && !rt.guideEnemyShown;
    const destinationSteps = flagTravel ? flagSteps : Math.max(0, Math.ceil((guide?.distance || 0) / .75));
    if (unifiedDestination && flagTravel && !rt.def.keepFlagTravelTask && !rt.def.hideGuideSteps) shownTaskLabel = `旗まで あと${flagSteps}歩`;
    if (guide?.marker?.guideDefend && !rt.guideEnemyShown && !rt.def.keepDefendTaskLabel) {
      const reached = guardPostDistance(rt, guide) < defenseRadius(rt, guide.marker);
      shownTaskLabel = reached ? 'ここで待つ' : '旗のそばへ';
    }
    if (recovering(rt)) shownTaskLabel = rt.def.recoveryTaskLabel?.(rt) || '立つまで まとう';
    // 教えの戦でない戦は、行き先と行動だけを書く（操作のやり方は出さない）
    if (rt.teachOn && !rt.teachOn()) shownTaskLabel = noOps(shownTaskLabel);
    setClass($('objectives'), 'route-summary', singleBattleGuide(rt) && !!guide?.marker && !rt.guideEnemyShown && !rt.dodgeGuide && !waitGuard && !this.retreatGuide?.active);
    setClass($('objectives'), 'unified-destination', unifiedDestination);
    const routeOrder = singleBattleGuide(rt) && !!guide?.marker && !flagTravel && !waitingOrder &&
      !guide.marker.guidePerson && !guide.marker.entrance && !guide.marker.guideSymbol &&
      !rt.guideEnemyShown && !rt.dodgeGuide && !retreatRequired(rt) && !this.retreatGuide?.active;
    setClass($('objectives'), 'route-order', routeOrder);
    setClass($('objectives'), 'flag-travel-order', !!flagTravel);
    setClass($('objectives'), 'goal-flag-order', /旗|はた/.test(shownTaskLabel) && !rt.def.town && !rt.def.dojo);
    setClass($('objectives'), 'attack-order', !!rt.guideEnemyShown);
    setClass($('objectives'), 'flag-order', shownTaskLabel === 'この はたへ');
    setClass($('objectives'), 'destination-order', !!guide?.marker && !guide.marker.guideArea && !rt.guideEnemyShown);
    setClass($('objectives'), 'arrived-order', !!guide?.marker && guide.distance < 8);
    const retreatMoving = this.retreatGuide?.active && this.retreatGuide.valid &&
      Math.hypot(this.retreatGuide.x - u.pos.x, this.retreatGuide.z - u.pos.z) >= this.retreatGuide.radius;
    // どちらもない時の未定義どうしの一致を、退路の一致として扱わない。
    const retreatWay = this.retreatGuide?.treatment ? this.retreatGuide : this.travelGuide && this.retreatGuide &&
      this.travelGuide.gx === this.retreatGuide.x && this.travelGuide.gz === this.retreatGuide.z
      ? this.travelGuide.retreatWay || this.retreatGuide : this.retreatGuide;
    this.retreatMoveDirection = retreatMoving && isTouch ? this.navigationDirection(rt, retreatWay) : '';
    this.retreatMoveAt = rt.t;
    // 指の向きを覚えてから行き先へ切り替える。時間だけでは説明を進めない。
    if (retreatMoving && isTouch && !this.retreatGuide.treatment) {
      if (this.retreatGestureRt !== rt || !this.retreatGestureActive) {
        this.retreatGestureRt = rt; this.retreatGestureX = u.pos.x; this.retreatGestureZ = u.pos.z;
        this.retreatGestureDone = false;
      }
      this.retreatGestureActive = true;
      if (Math.hypot(u.pos.x - this.retreatGestureX, u.pos.z - this.retreatGestureZ) >= 1.2)
        this.retreatGestureDone = true;
    } else this.retreatGestureActive = false;
    const retreatGesture = singleBattleGuide(rt) && this.retreatGestureActive && !this.retreatGestureDone;
    // 小型案内では、指の説明は戦の最初の退避で六秒だけ。下知の本文は残す。
    if (retreatMoving && this.retreatLessonRt !== rt) {
      this.retreatLessonRt = rt; this.retreatLessonAt = rt.t;
    }
    const retreatCaption = !singleBattleGuide(rt) && retreatMoving && isTouch && !this.retreatGuide.treatment &&
      (!rt.def.compactDestinationSign || rt.t - this.retreatLessonAt < 6);
    // 指の手本は実際に入力を受ける丸へ描く。札には重ねない。
    setClass($('objectives'), 'touch-retreat-coach', !!retreatCaption);
    if (retreatMoving) shownTaskLabel = this.retreatGuide.treatment
      ? treatmentGuideText(rt, this.retreatGuide) : retreatGuideText(rt, false);
    if (woundRetreat(rt) && !(this.retreatGuide?.active && this.retreatGuide.valid && this.retreatGuide.treatment))
      shownTaskLabel = retreatGuideText(rt, !!this.retreatGuide?.active && this.retreatGuide.valid && !retreatMoving);
    // 退く先と残りの歩数を既存の任務札へまとめる。戦固有の退路の名は保つ。
    if (retreatMoving) {
      const steps = Math.max(1, Math.ceil((Math.hypot(this.retreatGuide.x - u.pos.x, this.retreatGuide.z - u.pos.z) - this.retreatGuide.radius) / .75));
      // 越前など、退く理由を残す指定では出血中も指図を歩数で消さない。
      if (!rt.def.keepRetreatReason && woundRetreat(rt) && !rt.def.keepWoundRetreatReason) shownTaskLabel = '旗へ もどれ';
      else if (!rt.def.keepRetreatReason && (this.retreatGuide.treatment || !rt.def.retreatGuideLabel)) shownTaskLabel = this.retreatGuide.treatment ? treatmentGuideText(rt, this.retreatGuide) : '旗へ もどれ';
      if (!this.retreatGuide.treatment && !rt.def.keepRetreatReason && !rt.def.keepWoundRetreatReason)
        shownTaskLabel = 'ここへ さがろう';
      if (!rt.def.hideGuideSteps && !rt.def.retreatMoveGesture && shownTaskLabel !== 'ここへ さがろう') shownTaskLabel = /旗|はた/.test(shownTaskLabel) && !this.retreatGuide.treatment && !rt.def.keepRetreatReason && !rt.def.keepWoundRetreatReason
        ? `旗まで あと${steps}歩` : `${shownTaskLabel}${rt.def.retreatStepsNewLine ? '\n' : '・'}あと${steps}歩`;
    }
    if (retreatMoving && !this.retreatGuide.treatment &&
        (rt.def.retreatDestinationLabel?.(rt) === 'この丸まで進もう' || !rt.def.keepRetreatReason && !rt.def.keepWoundRetreatReason)) {
      const target = this.project(this.retreatGuide, groundAt(rt.world, this.retreatGuide.x, this.retreatGuide.z, u.pos.y) + .18, rt,
        this.retreatLabelProjection || (this.retreatLabelProjection = {}));
      if (target.behind || target.x < 48 || target.x > VIEW.w - 48 || target.y < 100 || target.y > VIEW.h - 28 ||
          !this.floorGoalVisible(rt, this.retreatGuide)) shownTaskLabel = '味方の後ろへ さがる';
    }
    if (singleBattleGuide(rt) && retreatMoving && !this.retreatGuide.treatment && !isTouch)
      shownTaskLabel = 'ここへ下がる';
    const waitFacing = waitingOrder && guide.distance < (guide.marker.guideRadius || 8) &&
      !retreatRequired(rt) && !this.retreatGuide?.active && !rt.dodgeGuide && !rainDanger(rt.army) && rt.def.waitFacingPoint?.(rt);
    let waitFacingHelp = '', waitFacingSide = '';
    if (waitFacing) {
      const dx = waitFacing.x - u.pos.x, dz = waitFacing.z - u.pos.z;
      const yaw = rt.player.yaw + (rt.player.camYawOff || 0);
      // 槍を向けた本人の向きで判定する。見回す視点だけでは合格にしない。
      const alignment = (Math.sin(p.yaw) * dx + Math.cos(p.yaw) * dz) / Math.max(.001, Math.hypot(dx, dz));
      this.waitFacingReady = alignment >= (this.waitFacingReady ? .82 : .87);
      const side = -dx * Math.cos(yaw) + dz * Math.sin(yaw) >= 0 ? '右' : '左';
      waitFacingSide = side;
      shownTaskLabel = isTouch && !rt.def.keepWaitFacingLabel ? this.waitFacingReady ? 'そのまま待とう' : `${side}へなぞる` :
        rt.def.waitFacingLabel?.(rt, this.waitFacingReady) ||
        (this.waitFacingReady ? 'そのまま待とう' : `${side}を向く`);
      if (!this.waitFacingReady) waitFacingHelp = isTouch
        ? '' : `手元の操作器を${side}へ動かす`;
    } else this.waitFacingReady = false;
    const taskTimeLabel = rt.def.taskTimeLabel?.(rt) || '';
    let edgeGoalDetail = taskTimeLabel;
    const combatLabel = combatTask(rt);
    const fighting = !!combatLabel || !!rt.guideEnemyShown || !!navigationEnemy(rt) || !!this.defendEnemy?.alive;
    // 安全な場所に着いた後も、元の進軍先への歩数を混ぜない。
    const treatmentWaiting =
      this.retreatGuide?.active && this.retreatGuide.valid && !retreatMoving;
    const edgePos = treatmentWaiting ? null : retreatMoving ? this.retreatGuide : guide?.marker?.guideDestination?.() || guide?.pos;
    if (!fighting && !(guide?.marker?.guideArea === 'move' && rt.def.guidePath?.(rt, guide.marker)?.length > 1) && !rt.def.hideGuideSteps && !rt.def.hideEdgeGoalDistance && edgePos && !flagTravel && !guide?.marker?.guideTalk && !retreatMoving &&
        !waitFacing && !rt.def.town && !rt.def.dojo) {
      const target = this.project(edgePos, groundAt(rt.world, edgePos.x, edgePos.z, edgePos.y ?? u.pos.y), rt, this.edgeGoalProjection || (this.edgeGoalProjection = {}));
      const distance = Math.hypot(edgePos.x - u.pos.x, edgePos.z - u.pos.z);
      if (distance > (retreatMoving ? this.retreatGuide.radius : guide?.marker?.guideRadius || 3) &&
          (target.behind || target.x < 64 || target.x > VIEW.w - 64 || target.y < 76 || target.y > VIEW.h - 48))
        edgeGoalDetail = `${rt.def.guidePlaceName || '旗'}まで${Math.max(1, Math.ceil(distance / .75))}歩`;
    }
    // 戦固有の正式な退き先がある時だけ、一時退避の見出しより優先する。
    const retreatTaskLabel = rt.def.retreatTaskLabel?.(rt, this.retreatGuide);
    if (retreatTaskLabel) shownTaskLabel = retreatTaskLabel;
    // 押し方は実際の攻撃釦へ集め、任務札には目的を残す。
    if (combatLabel) shownTaskLabel = combatLabel;
    // 攻める任務でも、今する操作を先に示す。守りの札と逆の指図を並べない。
    // 見出しを保つ戦は、戦闘用の文が退避などで空でも元の下知を残す。
    if ((!rt.def.keepCombatTaskHeading || rt.def.scoutOperationGuide?.(rt)) && (combatLabel || rt.guideEnemyShown || rt.def.scoutOperationGuide?.(rt)) && isTouch && this.defendEnemy?.alive && !this.guardAlly) {
      shownTaskLabel = releaseReady ? '手を はなす' :
        waitGuard ? rt.player.guard ? 'そのまま ふせぐ' : '押して ふせぐ' :
        this.approachGuideEnemy ? this.meleeApproachText(rt) || 'はたへ すすもう' :
        !this.guardFacing ? `この人を ${Math.sin(Math.atan2(this.defendEnemy.pos.x - u.pos.x,
          this.defendEnemy.pos.z - u.pos.z) - p.yaw) <= 0 ? '右' : '左'}へなぞる` :
        this.attackGuideEnemy ? attackOperation(rt) :
        '押して ふせぐ';
    }
    // 下知を残す指定の戦では、持ち場を離れて敵へ進む案内で上書きしない。
    if (!rt.def.keepTaskLabel && isTouch && rt.guideEnemyShown && rt.guideEnemy?.alive && !waitGuard &&
        !rt.dodgeGuide && !retreatRequired(rt) && !this.retreatGuide?.active && !rainDanger(rt.army) &&
        !this.guardAlly && !this.defendEnemy?.alive) {
      const enemy = rt.guideEnemy;
      const facing = Math.cos(Math.atan2(enemy.pos.x - p.u.pos.x, enemy.pos.z - p.u.pos.z) - p.yaw) > .85;
      const blade = p.weapon !== 'gun' && p.weapon !== 'bow';
      const near = Math.hypot(enemy.pos.x - p.u.pos.x, enemy.pos.z - p.u.pos.z) <= p.meleeReach(p.weapon === 'sword' ? 'slash' : 'thrust');
      // 向きと間合いの判定を保ち、近づく間は行き先だけを短く示す。
      shownTaskLabel = combatLabel === 'この敵をたおす' ? combatLabel : !facing || blade && !near ? 'あの敵へ すすめ' :
        'この敵をたおす';
    }
    if (retreatCaption && !this.retreatGuide.treatment && !retreatTaskLabel)
      shownTaskLabel = this.retreatGuide.ally?.alive ? retreatGuideText(rt, !retreatMoving) :
        rt.def.retreatDestinationLabel?.(rt) || shownTaskLabel;
    if (retreatMoving && !retreatCaption && /^旗まで あと\d+歩$/.test(shownTaskLabel))
      shownTaskLabel += '・' + this.navigationMoveText(rt, this.retreatGuide);
    // 槍を向ける案内は、生きて見える相手と結ぶ。退避中は旗の案内を優先する。
    const missionEnemyTarget = rt.def.enemyTaskTarget?.(rt);
    const aiming = (/敵.*(?:槍|やり).*向け/.test(shownTaskLabel) || !!missionEnemyTarget) && !retreatMoving && !retreatRequired(rt) &&
      !this.retreatGuide?.active && !rt.dodgeGuide && !rainDanger(rt.army) && !recovering(rt);
    const aimEnemy = waitFacing ? rt.def.waitFacingTarget?.(rt) || rt.def.aimGuideTarget?.(rt) :
      aiming ? missionEnemyTarget || rt.def.waitFacingTarget?.(rt) || rt.def.aimGuideTarget?.(rt) || this.defendEnemy || rt.guideEnemy : null;
    this.aimGuideEnemy = aimEnemy?.alive && !aimEnemy.gone && !aimEnemy.fleeing && !aimEnemy.woundOut &&
      !aimEnemy.downed && !aimEnemy.dropped && !aimEnemy.noTarget && !aimEnemy.isStruct &&
      aimEnemy.team !== u.team && sightScreenUnit(rt, aimEnemy) ? aimEnemy : null;
    // 下知の相手が隠れていても、見えて戦える一人と操作を結ぶ。探索は毎秒五回まで。
    if (aiming && (!missionEnemyTarget || !this.aimGuideEnemy)) {
      const search = this.aimSearch || (this.aimSearch = { rt: null, at: -1, enemy: null });
      if (search.rt !== rt || rt.t < search.at || rt.t - search.at >= .2) {
        search.rt = rt; search.at = rt.t; search.enemy = this.aimGuideEnemy;
        // 見える近い敵へ印を付ける。ほぼ同じ距離の相手では印を飛ばさない。
        let nearest = search.enemy ? Math.min(18 * 18,
          ((search.enemy.pos.x - u.pos.x) ** 2 + (search.enemy.pos.z - u.pos.z) ** 2) * .8) : 18 * 18;
        for (const enemy of rt.army.units) {
          if (!enemy.alive || enemy.team === u.team || enemy.gone || enemy.fleeing || enemy.woundOut ||
              enemy.downed || enemy.dropped || enemy.noTarget || enemy.civ || enemy.isStruct ||
              enemy.group?.hidden || enemy.isOfficer && !enemyKnown(rt, enemy) ||
              rt.def.enemyGuideAllowed?.(rt, enemy) === false) continue;
          const distance = (enemy.pos.x - u.pos.x) ** 2 + (enemy.pos.z - u.pos.z) ** 2;
          if (distance >= nearest || !sightScreenUnit(rt, enemy)) continue;
          nearest = distance; search.enemy = enemy;
        }
      }
      const enemy = search.enemy;
      if (enemy?.alive && !enemy.gone && !enemy.fleeing && !enemy.woundOut &&
          !enemy.downed && !enemy.dropped && !enemy.group?.hidden &&
          Math.hypot(enemy.pos.x - u.pos.x, enemy.pos.z - u.pos.z) < 18 &&
          sightScreenUnit(rt, enemy)) this.aimGuideEnemy = enemy;
    }
    let aimHelp = '';
    // 向きが合ったら指の札を畳む。小さな揺れでは出し直さない。
    const aimAlignment = this.aimGuideEnemy ? Math.cos(Math.atan2(this.aimGuideEnemy.pos.x - u.pos.x,
      this.aimGuideEnemy.pos.z - u.pos.z) - rt.player.yaw - (rt.player.camYawOff || 0)) : -1;
    this.aimFacingReady = !!this.aimGuideEnemy && aimAlignment >=
      (this.aimFacingEnemy === this.aimGuideEnemy && this.aimFacingReady ? .82 : .87);
    this.aimFacingEnemy = this.aimGuideEnemy;
    const aimTurning = !!this.aimGuideEnemy && !this.aimFacingReady;
    if ((aiming || waitFacing) && this.aimGuideEnemy && !aimTurning) {
      shownTaskLabel = aiming ? rt.def.aimReadyLabel?.(rt) || '印の敵を 見て待とう' : '印の敵を 見て待とう';
      // 向きが合った後に「向けよう」を残して、さらに回すよう促さない。
      if (/敵.*(?:槍|やり).*向け/.test(shownTaskLabel)) shownTaskLabel = 'そのまま待とう';
    }
    if (aimTurning) {
      const enemy = this.aimGuideEnemy, dx = enemy.pos.x - u.pos.x, dz = enemy.pos.z - u.pos.z;
      const yaw = rt.player.yaw + (rt.player.camYawOff || 0);
      waitFacingSide = -dx * Math.cos(yaw) + dz * Math.sin(yaw) >= 0 ? '右' : '左';
      shownTaskLabel = isTouch ? rt.player.weapon === 'spear' ? '敵に やりを向けよう' : '敵へ 向こう' : rt.def.aimGuideLabel?.(rt) || 'この敵をねらう';
      aimHelp = isTouch ? '印の敵へ やりを向ける' : `手元の操作器を${waitFacingSide}へ動かす`;
      if (!isTouch && !rt.def.hideGuideSteps) aimHelp += `・敵まで あと${Math.max(1, Math.ceil(Math.hypot(dx, dz) / .75))}歩`;
    }
    const facingGesture = isTouch && (aimTurning || !!waitFacing && !this.waitFacingReady);
    setClass($('objectives'), 'facing-order', !!facingGesture);
    setClass($('objectives'), 'facing-left', !!facingGesture && !!S.touchSwap);
    if (facingGesture) {
      // 指と操作文は一枚の札。描く直前に、実寸で位置をそろえる。
      this.facingSwipeRight = waitFacingSide === '右';
      aimHelp = ''; waitFacingHelp = ''; edgeGoalDetail = '';
    }
    const targetingEnemy = !facingGesture && !this.approachGuideEnemy && !retreatMoving &&
      !rt.dodgeGuide && !!(this.aimGuideEnemy?.alive || this.attackGuideEnemy?.alive || rt.guideEnemyShown && rt.guideEnemy?.alive);
    const showAttackOperation = !this.defendEnemy?.alive || !!this.attackGuideEnemy && this.guardFacing;
    if (targetingEnemy && showAttackOperation && !rt.def.singleTaskGuide && !rt.def.keepCombatTaskHeading) shownTaskLabel = 'この てきを たおそう';
    if (isTouch && !fighting && !facingGesture && guide?.marker &&
        /^(guard|wait)$/.test(guide.marker.guideArea) && guide.distance >= (guide.marker.guideRadius || 8))
      shownTaskLabel = rt.def.waitTravelLabel?.(rt) || '旗へ進む';
    // 敵をねらう・向きを変える案内を保ち、守る場所へ移動する時だけ言い換える。
    if (outsideGuardPost && !targetingEnemy && !facingGesture && !combatLabel && !retreatRequired(rt) && !this.retreatGuide?.active && !rt.dodgeGuide && !recovering(rt)) shownTaskLabel = rt.def.guardTravelLabel?.(rt) || '旗へ進む';
    // 教えを終えた後も、攻撃の操作を短い一文で残す。
    if (rt.teachOn && !rt.teachOn() && !retreatMoving && !retreatRequired(rt) && !rt.dodgeGuide && !recovering(rt)) {
      if (!rt.def.keepCombatTaskHeading && showAttackOperation && (targetingEnemy || !rt.def.keepTaskLabel && navigationEnemy(rt) && !this.guardAlly)) shownTaskLabel = 'この てきを たおそう';
      else if (/^(?:旗までなぞろう|旗の輪へ\s*すすむ)$/.test(shownTaskLabel)) shownTaskLabel = '旗へ進もう';
    }
    if (this.approachGuideEnemy?.alive && !rt.def.keepCombatTaskHeading && !retreatMoving &&
        !retreatRequired(rt) && !this.retreatGuide?.active && !rt.dodgeGuide && !recovering(rt))
      shownTaskLabel = this.meleeApproachText(rt) || '近づいて たたかう';
    // 同じ任務札を距離に合わせて切り替え、移動の説明だけで終わらせない。
    const attackTarget = this.approachGuideEnemy || this.attackGuideEnemy || (rt.guideEnemyShown && rt.guideEnemy);
    if (isTouch && attackTarget?.alive && !rt.def.keepTaskLabel && !rt.def.keepCombatTaskHeading && !rt.def.singleTaskGuide &&
        (!this.defendEnemy || this.approachGuideEnemy || this.attackGuideEnemy && this.guardFacing) &&
        !this.guardAlly && !facingGesture && !retreatMoving && !retreatRequired(rt) && !this.retreatGuide?.active &&
        !rt.dodgeGuide && !rainDanger(rt.army) && !recovering(rt) && p.weapon !== 'gun' && p.weapon !== 'bow') {
      const near = Math.hypot(attackTarget.pos.x - u.pos.x, attackTarget.pos.z - u.pos.z) <= p.meleeReach(p.weapon === 'sword' ? 'slash' : 'thrust');
      shownTaskLabel = near ? attackOperation(rt) : '近づいて たたかう';
    }
    // 戦固有の敵への指図も残し、退避や向き直しの操作は上書きしない。
    if (targetingEnemy && !retreatMoving && !retreatRequired(rt) && !this.retreatGuide?.active && !recovering(rt))
      shownTaskLabel = rt.def.enemyTaskLabel?.(rt, this.aimGuideEnemy || this.attackGuideEnemy || rt.guideEnemy) || shownTaskLabel;
    if (retreatMoving && !this.retreatGuide.treatment && !rt.def.keepRetreatReason && !rt.def.keepWoundRetreatReason) {
      const target = this.project(this.retreatGuide, groundAt(rt.world, this.retreatGuide.x, this.retreatGuide.z, u.pos.y) + .18, rt,
        this.retreatLabelProjection || (this.retreatLabelProjection = {}));
      const visible = !target.behind && target.x > 48 && target.x < VIEW.w - 48 && target.y > 100 && target.y < VIEW.h - 28 &&
        this.floorGoalVisible(rt, this.retreatGuide);
      shownTaskLabel = visible ? 'ここへ下がる' : '矢印の方へ下がる';
    }
    if (retreatMoving && this.retreatGuide.treatment && isTouch)
      shownTaskLabel = (typeof rt.def.treatmentMoveCaption === 'function' ? rt.def.treatmentMoveCaption(rt) : rt.def.treatmentMoveCaption) || '＋まで もどろう';
    // 退く理由を残す戦では、操作の向きは補足へ置き、下知を上書きしない。
    if (retreatCaption && !rt.def.keepRetreatGestureReason) shownTaskLabel = `${this.retreatMoveDirection}になぞる`;
    if (retreatGesture) shownTaskLabel = `${this.retreatMoveDirection}になぞる`;
    else if (singleBattleGuide(rt) && this.retreatGestureActive)
      shownTaskLabel = rt.def.keepRetreatReason || rt.def.keepWoundRetreatReason
        ? retreatGuideText(rt, false) : '旗へ進もう';
    shownTaskLabel = facingGesture ? '印の敵へ向く' :
      fieldLabel(rt.def.conciseTaskLabel?.(rt, shownTaskLabel) || shownTaskLabel);
    // 既存の任務札を目標に添える。退避・守備の下知は保つ。
    if ((!rt.def.keepCombatTaskHeading && !rt.def.keepTaskLabel || singleBattleGuide(rt) && !!combatLabel) &&
        rt.guideEnemyShown && rt.guideEnemy?.alive && !this.aimGuideEnemy &&
        (!this.defendEnemy || this.attackGuideEnemy || this.approachGuideEnemy) &&
        !retreatMoving && !retreatRequired(rt) && !this.retreatGuide?.active && !rt.dodgeGuide)
      shownTaskLabel = 'この敵をたおす';
    if (singleBattleGuide(rt) && /^(この旗へ|旗へ進もう)$/.test(shownTaskLabel))
      shownTaskLabel = 'ここへ進む';
    setClass($('objectives'), 'flag-task', !!guide?.marker && /^(旗へもどろう|ここを守ろう|この中を守れ)$/.test(shownTaskLabel));
    setClass($('objectives'), 'rescue-order', /^(この人に 近づこう|そばで 敵からまもる)$/.test(shownTaskLabel));
    // 歩数と人数の更新だけでは札を開き直さない。任務・進軍段階・下知の変化で八秒間読む。
    const orderKey = (goalObjective?.id || '') + '|' + rt.phase + '|' +
      (goalObjective?.text || '').replace(/[0-9０-９]+/g, '数') + '|' + shownTaskLabel.replace(/[0-9０-９]+/g, '数');
    if (this.quietOrderRt !== rt || this.quietOrderKey !== orderKey) {
      this.quietOrderRt = rt; this.quietOrderKey = orderKey; this.quietOrderAt = rt.t;
    }
    const urgentOrder = retreatRequired(rt) || retreatCaption || rt.dodgeGuide || recovering(rt) ||
      treatmentWaiting || (p.treatmentLeft > 0 && u.hp < u.maxHp * 0.6 && !p.bandaged) ||
      u.hp < u.maxHp * 0.3 || u.wounds?.bleed > 0;
    // 今の指示は読み終えても残す。繰り返す一時の知らせにはしない。
    setClass($('objectives'), 'order-settled', false);

    if (isTouch && !rt.def.escortGuideTarget?.(rt)?.alive && rt.def.routeDestinationSight &&
        rt.def.routeGuidePriority?.(rt) && (rt.flags.routeSign?.door || rt.flags.routeSign?.indoor))
      shownTaskLabel = rt.def.travelGuideLabel?.(rt) || this.navigationMoveText(rt, rt.flags.routeSign);
    // 指の手本は目的地と同じ札へまとめ、別の知らせを増やさない。
    this.destinationMoveDirection = '';
    if (singleBattleGuide(rt) && isTouch && !S.reduceGuidance && !guidanceEnded(rt) &&
        !this.openingActive && !rt.choice && !rt.over && !p.camShot && !this.bigmap && !rt.dodgeGuide) {
      if (retreatMoving && !this.retreatGuide.treatment) {
        this.destinationMoveDirection = this.navigationDirection(rt, retreatWay);
        if (!rt.def.keepRetreatReason && !rt.def.keepWoundRetreatReason) shownTaskLabel = 'ここへ下がる';
      } else if (this.approachGuideEnemy?.alive && !retreatRequired(rt) && !this.retreatGuide?.active) {
        const enemy = this.approachGuideEnemy;
        const angle = Math.atan2(enemy.pos.x - u.pos.x, enemy.pos.z - u.pos.z) - p.yaw;
        this.destinationMoveDirection = Math.cos(angle) < .9 ? Math.sin(angle) <= 0 ? '右' : '左' : '上';
      } else if (rt.def.routeGuidePriority?.(rt) && /^(右|左)へ(?:向|曲)/.test(shownTaskLabel)) {
        this.destinationMoveDirection = shownTaskLabel.startsWith('右') ? '右' : '左';
      }
    }
    // 見出しは目的、補足は操作に分け、同じなぞり方を二度書かない。
    if (facingGesture) {
      this.destinationMoveDirection = waitFacingSide;
      shownTaskLabel = this.aimGuideEnemy?.alive ? '印の敵へ向く' : '矢印へ向く';
    }
    if (this.destinationMoveDirection) {
      if (!retreatMoving && this.approachGuideEnemy?.alive)
        shownTaskLabel = `${this.destinationMoveDirection}へなぞる`;
    }
    if (retreatMoving && !this.retreatGuide.treatment) {
      if (this.retreatGuide.ally?.alive) shownTaskLabel = 'ここへ';
      else if (!rt.def.keepRetreatReason && !rt.def.keepWoundRetreatReason) shownTaskLabel = 'ここへ行こう';
      this.destinationMoveDirection = '';
    }
    if (!this.destinationMoveDirection || facingGesture) setClass($('objectives'), 'swipe-order', false);
    // 戦ごとの短縮文より操作を優先し、待つ札と指の絵を食い違わせない。
    if (facingGesture) {
      shownTaskLabel = isTouch ? `${waitFacingSide}へなぞる` : this.aimGuideEnemy?.alive ? p.weapon === 'spear' ? '敵に やりを向けよう' : '敵へ 向こう' : `${rt.def.waitFacingLabel?.(rt, false) || '向きを変える'}・${waitFacingSide}へなぞる`;
      this.destinationMoveDirection = '';
    } else if (waitFacing && this.waitFacingReady && !aimTurning) {
      shownTaskLabel = 'そのまま待とう';
    }
    const waitCue = !fighting && !targetingEnemy && !facingGesture && !retreatRequired(rt) &&
      !this.retreatGuide?.active && !rt.dodgeGuide && !rainDanger(rt.army) && !recovering(rt) &&
      this.waitDestinationCue(rt, guide);
    if (waitCue?.outside) shownTaskLabel = this.destinationPurpose(rt);
    if (routeOrder && guide.marker.guideArea === 'move' && !facingGesture &&
        !targetingEnemy && !fighting && rt.def.travelGuideLabel)
      shownTaskLabel = this.destinationPurpose(rt);
    else if (waitCue && !waitCue.outside && u.moving > .05) shownTaskLabel = isTouch ? '指をはなそう' : 'ここで止まろう';
    if (waitCue?.outside) setClass($('objectives'), 'flag-task', true);
    setClass($('objectives'), 'defend-return', !!waitCue?.outside && !!guide.marker.guideDefend);
    if (!fighting && !targetingEnemy && !facingGesture && !retreatMoving && !rt.dodgeGuide &&
        guide?.marker?.entrance && guide.marker.guideDestination && !rt.nearestInteract())
      shownTaskLabel = rt.def.travelGuideLabel?.(rt) || '入口の印へ進む';
    // 距離の判定は実際の武器の間合いを使い、任務と操作を一文にする。
    const meleeTarget = (p.inRange && p.rangeCueTarget?.alive ? p.rangeCueTarget : null) ||
      this.approachGuideEnemy || this.attackGuideEnemy ||
      this.aimGuideEnemy || (rt.guideEnemyShown && rt.guideEnemy) || guide?.closeEnemy;
    this.combatActionUnified = isTouch && meleeTarget?.alive &&
      (this.approachGuideEnemy?.alive || this.attackGuideEnemy?.alive ||
        !rt.def.keepCombatTaskHeading && !rt.def.keepTaskLabel && !rt.def.singleTaskGuide) &&
      !this.guardAlly && (!this.defendEnemy || this.approachGuideEnemy || this.attackGuideEnemy && this.guardFacing) &&
      !facingGesture && !retreatMoving && !retreatRequired(rt) && !this.retreatGuide?.active &&
      !rt.dodgeGuide && !rainDanger(rt.army) && !recovering(rt) &&
      p.weapon !== 'gun' && p.weapon !== 'bow';
    if (this.combatActionUnified) {
      const near = Math.hypot(meleeTarget.pos.x - u.pos.x, meleeTarget.pos.z - u.pos.z) <=
        p.meleeReach(p.weapon === 'sword' ? 'slash' : 'thrust');
      const angle = Math.atan2(meleeTarget.pos.x - u.pos.x, meleeTarget.pos.z - u.pos.z) - p.yaw;
      const facing = Math.cos(angle) >= .9;
      if (!near || !facing) {
        this.destinationMoveDirection = Math.cos(angle) < .9 ? Math.sin(angle) <= 0 ? '右' : '左' : '上';
      }
      shownTaskLabel = near && facing ? attackOperation(rt) : '近づこう';
      if (near && facing) this.destinationMoveDirection = '';
      aimHelp = ''; waitFacingHelp = ''; edgeGoalDetail = '';
    }
    // 持ち場を守る下知がある戦も、反撃できる瞬間は相手と操作を先に示す。
    if (this.attackGuideEnemy?.alive && this.guardFacing && !facingGesture &&
        !retreatMoving && !retreatRequired(rt) && !this.retreatGuide?.active &&
        !rt.dodgeGuide && !rainDanger(rt.army) && !recovering(rt) &&
        p.weapon !== 'gun' && p.weapon !== 'bow') {
      shownTaskLabel = attackOperation(rt);
      edgeGoalDetail = '';
    }
    const travellingNow = travelSignPriority(rt) && !this.aimGuideEnemy?.alive;
    const enemyMoveHelp = !travellingNow && !!this.destinationMoveDirection && !!meleeTarget?.alive &&
      (!!this.approachGuideEnemy || this.combatActionUnified) && !retreatMoving && !facingGesture;
    if (enemyMoveHelp) shownTaskLabel = this.destinationMoveDirection === '上'
      ? '上になぞる' : `${this.destinationMoveDirection}になぞる`;
    else if (this.combatActionUnified) shownTaskLabel = attackOperation(rt);
    if (travellingNow && !retreatRequired(rt) && !rt.dodgeGuide && !this.retreatGuide?.active &&
        !recovering(rt) && !rainDanger(rt.army)) {
      shownTaskLabel = this.destinationPurpose(rt);
      this.combatActionUnified = false;
      this.destinationMoveDirection = '';
      setClass($('objectives'), 'facing-order', false);
      setClass($('objectives'), 'swipe-order', false);
      aimHelp = ''; waitFacingHelp = ''; edgeGoalDetail = '';
    } else if (guide?.marker?.guideDefend && !fighting && !targetingEnemy && !facingGesture &&
        !this.combatActionUnified && !this.attackGuideEnemy?.alive &&
        !retreatRequired(rt) && !rt.dodgeGuide && !rainDanger(rt.army) &&
        !this.retreatGuide?.active && !recovering(rt) && !rt.def.keepDefendTaskLabel) {
      shownTaskLabel = 'ここを守ろう';
    }
    // 手当てへ進む前に必要な下馬を、移動や守備の札より先に示す。
    const careSequence = singleBattleGuide(rt) && (dismountFirst(rt) || retreatMoving || treatmentRequired(rt));
    setClass($('objectives'), 'sequential-order', careSequence);
    setClass($('objectives'), 'dismount-order', !!dismountFirst(rt));
    if (careSequence) {
      aimHelp = ''; waitFacingHelp = ''; edgeGoalDetail = '';
    }
    if (dismountFirst(rt)) {
      shownTaskLabel = '馬をおりる';
      this.destinationMoveDirection = '';
      aimHelp = ''; waitFacingHelp = ''; edgeGoalDetail = '';
    }
    if (singleBattleGuide(rt) && !this.openingActive && !enemyMoveHelp && !facingGesture && /なぞ|矢印|指をはな/.test(shownTaskLabel)) {
      shownTaskLabel = retreatMoving ? retreatGuideText(rt, false) :
        rt.guideEnemyShown && rt.guideEnemy?.alive ? `印の敵へ進み ${attackOperation(rt)}` :
        taskText(rt, goalObjective?.text || '味方の旗へ進む');
      aimHelp = ''; waitFacingHelp = '';
    }
    // 待つ向きと守備範囲は、短縮処理の後も実際の判定に合わせる。札は増やさない。
    if (waitFacing && !aimTurning && !retreatMoving && !careSequence && !recovering(rt))
      shownTaskLabel = this.waitFacingReady ? rt.def.waitFacingLabel?.(rt, true) || rt.def.waitOrderLabel?.(rt, true) || '敵が来るまで待とう' :
        `${rt.def.waitFacingTarget?.(rt)?.alive ? '印の敵へ向く' : rt.def.waitFacingLabel?.(rt, false) || '矢印へ向く'}${isTouch ? `・${waitFacingSide}へなぞる` : ''}`;
    if (guide?.marker?.guideDefend &&
        !retreatRequired(rt) && !this.retreatGuide?.active && !careSequence && !rt.dodgeGuide && !rainDanger(rt.army) && !recovering(rt)) {
      const defendText = guardPostDistance(rt, guide) >= defenseRadius(rt, guide.marker) ? '旗まで進む' : 'ここで守る';
      if (!fighting && !targetingEnemy && !facingGesture) shownTaskLabel = defendText;
      else edgeGoalDetail = defendText; // 接敵中も同じ札の中で、持ち場の内外を伝える。
    }
    if (/^(?:この|近くの)?敵を\s*たお[すせ]$/.test(shownTaskLabel) &&
        (meleeTarget?.alive || this.outlinedEnemy?.alive) &&
        !careSequence && !retreatRequired(rt) && !rt.dodgeGuide && !rainDanger(rt.army) && !recovering(rt))
      shownTaskLabel = p.inRange ? `印の敵へ ${attackOperation(rt)}` : '印の敵へ近づこう';
    // 操作の短縮や戦固有の文より後で、触る側と指の動きを一枚に示す。
    if (facingGesture && !careSequence && !retreatMoving && !retreatRequired(rt) && !rt.dodgeGuide && !recovering(rt)) {
      shownTaskLabel = aimTurning || rt.def.waitFacingTarget?.(rt)?.alive ? '敵へ向こう' :
        rt.def.waitFacingLabel?.(rt, false) || '矢印の先へ向こう';
      aimHelp = ''; waitFacingHelp = '';
      edgeGoalDetail = `${S.touchSwap ? '左' : '右'}側を${waitFacingSide}へなぞる`;
    }
    // 待つ下知が最終的に選ばれた時だけ、移動を促す印を休める。
    const idleWait = shownTaskLabel === 'そのまま待とう' ||
      waitFacing && this.waitFacingReady && shownTaskLabel === rt.def.waitFacingLabel?.(rt, true);
    if (shownTaskLabel === 'そのまま待とう')
      shownTaskLabel = rt.def.waitOrderLabel?.(rt, true) || '合図が出るまで待とう';
    this.quietWait = idleWait && !fighting && !targetingEnemy &&
      !this.openingActive && !rt.choice && !rt.over && !careSequence &&
      !retreatRequired(rt) && !this.retreatGuide?.active && !rt.dodgeGuide && !rainDanger(rt.army);
    setClass(this.root, 'quiet-wait', this.quietWait);
    this.releaseMoveActive = shownTaskLabel === '指をはなそう';
    // 道案内中は次の入口だけを示し、攻撃の説明を重ねない。
    const routePriority = !careSequence && !retreatMoving && !rt.dodgeGuide &&
      !retreatRequired(rt) && !this.retreatGuide?.active && rt.def.routeGuidePriority?.(rt);
    if (routePriority) {
      shownTaskLabel = rt.def.taskLabel?.(rt, shownTaskLabel) || this.destinationPurpose(rt);
      aimHelp = ''; waitFacingHelp = ''; edgeGoalDetail = '';
      this.combatActionUnified = false;
    }
    // 反撃の判断は既存の案内を使い、届く正面の一人だけを「今」の合図にする。
    const attackCue = this.attackGuideEnemy;
    this.attackCueEnemy = isTouch && attackCue?.alive && this.guardFacing &&
      !enemyMoveHelp && !facingGesture && !routePriority && !travellingNow && !careSequence &&
      !retreatMoving && !retreatRequired(rt) && !this.retreatGuide?.active &&
      !rt.dodgeGuide && !rainDanger(rt.army) && !recovering(rt) &&
      !this.openingActive && !rt.over && !rt.choice && !p.camShot && !this.bigmap && !S.reduceGuidance &&
      p.weapon !== 'gun' && p.weapon !== 'bow' &&
      Math.hypot(attackCue.pos.x - u.pos.x, attackCue.pos.z - u.pos.z) <=
        p.meleeReach(p.weapon === 'sword' ? 'slash' : 'thrust') ? attackCue : null;
    if (this.attackCueEnemy) {
      shownTaskLabel = `今${attackOperation(rt)}`;
      aimHelp = ''; waitFacingHelp = ''; edgeGoalDetail = '';
    }
    // 共通の印と同じ行き先から、最後に一つだけ下知を選ぶ。
    if (pinGuideOn(rt) && !careSequence && !recovering(rt)) {
      const dodge = rt.dodgeGuide?.valid ? rt.dodgeGuide : null;
      const withdrawing = retreatMoving && !this.retreatGuide.treatment;
      const retreatOrder = guide?.marker && /下が|さが|退[くきけ]|退却/.test(shownTaskLabel) &&
        guide.distance >= (guide.marker.guideRadius || 8);
      const pos = dodge?.pos || (withdrawing ? this.retreatGuide : retreatOrder ? guide.pos : null);
      if (pos) {
        shownTaskLabel = dodge?.arrived ? 'ここで 待とう' : `${this.battleMoveCue(rt, pos).direction}へ さがろう`;
        aimHelp = ''; waitFacingHelp = ''; edgeGoalDetail = ''; this.destinationMoveDirection = '';
      } else if (waitFacing && !retreatMoving) {
        shownTaskLabel = this.waitFacingReady ? 'そのまま 待とう' : rt.def.waitFacingLabel?.(rt, false) || '矢印へ 向こう';
        aimHelp = ''; waitFacingHelp = ''; edgeGoalDetail = ''; this.destinationMoveDirection = '';
      }
    }
    // 救助中は共通の向き案内より、守る本人への下知を優先する。
    if (rescue && rt.def.guardGuideAllowed?.(rt) !== false && !careSequence &&
        !retreatRequired(rt) && !this.retreatGuide?.active && !rt.dodgeGuide) {
      shownTaskLabel = rescueNear ? 'そばで 敵からまもる' : 'この人に 近づこう';
      aimHelp = ''; waitFacingHelp = ''; edgeGoalDetail = '';
      this.attackCueEnemy = null;
      setClass($('objectives'), 'rescue-order', true);
    }
    // 同じ操作を見出しと補足に二度出さない。
    if (edgeGoalDetail === shownTaskLabel || routePriority) edgeGoalDetail = '';
    // 移動の歩数を畳む時も、合流に間に合うまでの残り時間は別行に残す。
    if (routePriority && taskTimeLabel) edgeGoalDetail = taskTimeLabel;
    // 共通の旗の囲みへ、守備中の短い下知だけを渡す。
    this.missionFlagLabel = /^(この旗を守ろう|ここを守ろう|ここで守ろう)$/.test(shownTaskLabel) ? shownTaskLabel : '';
    this.missionFlagObjective = goalObjective;
    setClass($('objectives'), 'enemy-move-help', enemyMoveHelp && !dismountFirst(rt));
    // 操作の文と同じ一人を描画へ渡し、別の兵の印を先に出さない。
    this.moveGuideEnemy = enemyMoveHelp && !routePriority && !careSequence ? meleeTarget : null;
    setClass($('objectives'), 'compact-steps', /^(?:旗|敵)まで あと\d+歩(?:・.*)?$/.test(shownTaskLabel));
    // 心得の札（史実の負け戦）は、出てから六十秒は狭い画面でも「今」の下に見せる
    const noteFresh = (o) => o.kind === 'note' && !o.state && rt.t - (o.t ?? 0) < 60;
    const key = (rt.objectives.some(noteFresh) ? 'nf' : '') + (rt.enemyIntel?.version || 0) + JSON.stringify(rt.objectives) + folded.length + (filler ? filler.text : '') + (guide?.key || '') + (guide?.label || '') + Math.round(guide?.distance || 0) + (goalObjective?.id || '') + this.taskShownText + shownTaskLabel + waitFacingHelp + aimHelp + waitFacingSide + edgeGoalDetail + retreatCaption + unifiedDestination + destinationSteps + !!treatmentWaiting + fighting + targetingEnemy + touchMoveLearned(rt);
    if (key + this.destinationMoveDirection !== this.objKey) {
      this.objKey = key + this.destinationMoveDirection;
      this.doneSet = this.doneSet || new Set();
      // 今やる任務（命令があれば命令、なければ主のまだ済んでいない物）に cur を付ける。低い画面ではそれだけを出す
      const vis = this.visibleObjectives || (this.visibleObjectives = []); vis.length = 0;
      let remaining = 0, done = 0, failed = 0;
      for (const o of rt.objectives) {
        if (o.state !== 'fail') vis.push(o);
        if (o.state === 'done') done++; else if (o.state === 'fail') failed++; else remaining++;
      }
      if (filler) vis.unshift(filler);
      let openCount = 0;
      for (const o of vis) if (o.state !== 'done' && o.state !== 'fail') openCount++;
      const cur = goalObjective || filler;
      this.curObjKey = guide?.key || null;
      const statusText = `残り ${remaining}件・済 ${done}件・失敗 ${failed}件`;
      $('objectives').setAttribute('aria-label', `任務の一覧を開く。${statusText}`);
      const objectiveRows = this.objectiveRows || (this.objectiveRows = []); objectiveRows.length = 0;
      // 指の絵は操作面の一つだけ。任務札には重ねない。
      const moveGesture = '';
      if (vis.length) objectiveRows.push('<li class="task-help"><small>「今」の任務を進めよう。</small></li>');
      for (const o of vis) {
        const tag = o.state === 'done' ? '済' : o.state === 'fail' ? '失敗' : o === cur ? '今' : { main: '主', side: '後で', order: '下知', guide: '待つ', note: '心得' }[o.kind] || '';
        // 果たしたばかりの任務は印が跳ねる
        const just = o.state === 'done' && !this.doneSet.has(o.id + o.text);
        if (o.state === 'done') this.doneSet.add(o.id + o.text);
        const pr = intelText(rt, o.text) === o.text && o.progress && o.state !== 'done' && o.state !== 'fail' ? progressRatio(o.progress) : null;
        const title = o === cur ? shownTaskLabel : (rt.teachOn && !rt.teachOn() ? noOps(o.text) : o.text);
        const facingHelp = !pinGuideOn(rt) && o === cur && (waitFacing && !this.waitFacingReady || aimTurning);
        const place = facingHelp ? aimHelp || waitFacingHelp || ' ' : !fighting && !treatmentWaiting && !recovering(rt) && o === cur && guide?.marker && !waitingOrder && !flagTravel && !unifiedDestination && !retreatMoving ? (timedWait ? '敵が来たら 防いでつく' : destinationDistance(rt, guide.distance, true)) + (guide.floorHint ? '・' + guide.floorHint : '') : '';
        // 指定した戦だけ、現在の案内に合う補足へ言い換える。任務の進みや判定は変えない。
        let progress = o === cur ? rt.def.taskDetail?.(rt, title, o.progress || '') ?? (o.progress || '') : o.progress || '';
        if ((combatLabel && !rt.def.keepCombatTaskDetail || routePriority) && o === cur) progress = '';
        if (rt.teachOn && !rt.teachOn()) progress = noOps(progress);
        const detail = o === cur && (careSequence || rt.def.key === 'anegawa' && guide?.marker || !rt.def.town && !rt.def.dojo && !rt.def.keepCombatTask) ? '' : taskDetail(fieldLabel(goalText(rt, title)), fieldLabel(goalText(rt, progress)));
        objectiveRows.push(`<li class="${o.state === 'done' ? 'done' : o.state === 'fail' ? 'fail' : ''} ${o.kind} ${noteFresh(o) ? 'note-fresh' : ''} ${folded.includes(o) ? 'folded-task' : ''} ${just ? 'justdone' : ''} ${o === cur || (just && !cur) ? 'cur' : ''} ${[...o.text].length > 20 ? 'long' : ''}"><span class="tag">${tag}</span><span class="obj-text">${o === cur ? `<span class="obj-now">${/^(この人に 近づこう|そばで 敵からまもる)$/.test(shownTaskLabel) ? RESCUE_SIGN : ''}${shownTaskLabel === 'この人を守れ' ? '<i class="guard-sign" aria-hidden="true"></i>' : ''}${(!isTouch && (facingGesture && this.aimGuideEnemy?.alive || this.approachGuideEnemy?.alive && shownTaskLabel === this.meleeApproachText(rt))) ? ENEMY_SIGN : ''}${esc(shownTaskLabel).split(/(\s+)/).map(part => /\s/.test(part) || !/\s/.test(shownTaskLabel) ? part : `<span class="task-phrase">${part}</span>`).join('').replace(/(\d+歩)/g, '<span class="step-count">$1</span>')}${moveGesture}${edgeGoalDetail ? `<small class="edge-goal-detail" style="display:block!important;font-size:max(${taskTimeLabel ? 22 : 15}px,calc(${taskTimeLabel ? 22 : 15}px * var(--text-scale,1)))!important;line-height:1.4">${esc(edgeGoalDetail).replace(/(\d+歩)/g, '<span class="step-count">$1</span>')}</small>` : ''}</span><span class="obj-full">${esc(fieldLabel(goalText(rt, rt.teachOn && !rt.teachOn() ? noOps(o.text) : o.text)))}</span>` : esc(fieldLabel(goalText(rt, rt.teachOn && !rt.teachOn() ? noOps(o.text) : o.text)))}</span>${detail && intelText(rt, o.text) === o.text ? `<small>${esc(detail)}</small>` : ''}${o.cue && !(o === cur && (fighting || this.approachGuideEnemy || rt.def.key === 'anegawa')) && o.state !== 'done' && o.state !== 'fail' && rt.t - (o.cueT || 0) < 30 ? `<small class="obj-cue">${esc(goalText(rt, o.cue))}</small>` : ''}${place ? `<small class="goal-place${facingHelp ? ' facing-help' : ''}">${facingHelp && isTouch ? `<svg class="facing-gesture" viewBox="0 -14 96 60" aria-hidden="true"><g transform="${waitFacingSide === '右' ? '' : 'translate(96 0) scale(-1 1)'}"><circle cx="20" cy="10" r="13" fill="none" stroke="#fff3ba" stroke-width="3"/><path d="M34 10H84M73 1L84 10L73 19" fill="none" stroke="#fff3ba" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M14 25V10Q14 3 20 3Q26 3 26 10V23L31 20L40 27L36 38H15L5 29Q1 23 7 22Z" fill="#fff3ba" stroke="#14120f" stroke-width="2"/></g></svg>` : ''}${esc(place).replace(/(\d+歩)/g, '<span class="step-count">$1</span>')}</small>` : ''}${pr !== null ? `<i class="opb" aria-hidden="true"><b style="width:${Math.round(pr * 100)}%"></b></i>` : ''}</li>`);
      }
      if (vis.length) objectiveRows.push(`<li class="more">ほかの任務<span class="obj-count">（${openCount}件）</span></li>`);
      setListRows($('obj-list'), objectiveRows);
    }
    // 携帯の横で、今の一言を読める大きさへ上げる。戦ごとの札に合わせた指定も保つ。
    {
      const now = isTouch ? $('obj-list').querySelector('li.cur .obj-now') : null;
      const minFont = rt.def.taskLabelMinFont ?? 20;
      // 歩数や攻撃の文が替わるたびに、書き換え直後の配置計算を強制しない。
      // 字の大きさに関わる見た目が同じなら、測った結果を使い回す。
      const key = now ? this.root.className + '|' + $('battle-notices').className + '|' +
        $('objectives').className + '|' + now.closest('li').className + '|' + VIEW.w + '|' + VIEW.h +
        '|' + document.documentElement.dataset.textSize + '|' + minFont : '';
      if (now && (now !== this.objNowEl || key !== this.objNowKey)) {
        this.objNowEl = now; this.objNowKey = key;
        now.style.removeProperty('font-size');
        const sizes = this.objFontSizes || (this.objFontSizes = new Map());
        let enlarge = sizes.get(key);
        if (enlarge === undefined) {
          enlarge = parseFloat(getComputedStyle(now).fontSize) < minFont - 1;
          sizes.set(key, enlarge);
        }
        if (enlarge) now.style.setProperty('font-size', `max(${minFont}px, calc(${minFont}px * var(--text-scale, 1)))`, 'important');
      }
    }
    // 組の状態
    const sq = $('h-squad');
    // 自分の組の人数・士気・陣形・号令の字の札は出さない。組の兵の頭上の小さな菱形で見せる（kaito 10/23「テキストで出さない、ビジュアルで」）。
    if (rt.def.squadCard && !simpleControls(rt) && rt.squadGroups.some((g) => g.count > 0)) {
      setHidden(sq, false);
      setClass(sq, 'urge', rt.cmdUrgeUntil > rt.t);
      // 自分の組の人数・士気・下知は、後ろにいても知っている。
      let alive = 0, squadMorale = 0;
      for (const s of rt.squad) if (s.alive) { alive++; squadMorale += s.group.morale; }
      const squadCount = `${alive}人`;
      const sqMor = alive ? moraleWord(squadMorale / alive) : '組は全滅';
      let pips = '';
      for (const s of rt.squad) {
        const tip = s.name ? ` title="${esc(s.name)}"` : '';
        if (!s.alive) { pips += `<i class="dead"${tip}></i>`; continue; }
        const r = s.hp / s.maxHp;
        pips += `<i class="${r < 0.3 ? 'low blink' : r < 0.35 ? 'low' : r < 0.7 ? 'mid' : ''} ${s.type === 'bow' || s.type === 'gun' ? 'bow' : ''} ${s.roster && s.roster.battles > 0 ? 'vet' : ''}"${tip}></i>`;
      }
      // 隊ごとの号令：同じ種類の隊は一つにまとめ、どの隊も同じ号令なら「号令 ○○」の一つだけ（同じ字を並べない）
      const ordOf = (g) => {
        const order = g.focus ? ORDER_NAME.focus : ORDER_NAME[g.order] || '待て';
        return g.pending ? `${order}（${ORDER_NAME[g.pending.id] || '号令'}を伝え中）` : order;
      };
      const byKind = this.squadKindWork || (this.squadKindWork = []); byKind.length = 0;
      for (const g of rt.squadGroups) if (g.count > 0 && !byKind.some((x) => x.kind === g.kind)) byKind.push(g);
      const same = rt.squadGroups.every((g) => !g.count || ordOf(g) === ordOf(byKind[0]));
      const kindOrder = (g) => {
        const order = ordOf(g);
        for (const other of rt.squadGroups) if (other.count > 0 && other.kind === g.kind && ordOf(other) !== order) return '隊ごと';
        return order;
      };
      const fireOf = (g) => (g.kind === 'bow' || g.kind === 'gun' ? `<small>${byKind.length > 1 ? (GROUP_NAME[g.kind] || '').slice(0, -1) : ''}${g.fire ? '射撃中' : '射撃停止'}</small>` : '');
      let groups = same ? `<span class="ord">号令<b>${ordOf(byKind[0])}</b>` : '';
      for (const g of byKind) groups += same ? fireOf(g) : `<span class="ord">${byKind.length > 1 ? `${(GROUP_NAME[g.kind] || '槍隊').slice(0, -1)}：` : ''}<b>${kindOrder(g)}</b>${fireOf(g)}</span>`;
      if (same) groups += '</span>';
      const formOf = (g) => g.formation === 'yari' ? '横隊' : FORM_NAME[g.formation] || '';
      const form = rt.squadGroups.every((g) => !g.count || formOf(g) === formOf(byKind[0])) ? formOf(byKind[0]) : '隊ごと';
      const sel = byKind.length > 1 && p.selGroup !== 'all' ? `<span>号令先<b>${GROUP_NAME[p.selGroup]}</b></span>` : '';
      // 携帯の横向き：組の数・士気・今の号令・陣形の一行（押すと号令を選ぶ札を開く）。親指の輪と右下の丸の間の帯に置く
      if (isTouch && document.documentElement.classList.contains('tc-low')) {
        setStyle(sq, 'bottom', '');
        const sg = byKind.find((g) => g.kind === p.selGroup) || byKind[0];
        const now = same || p.selGroup !== 'all' ? kindOrder(sg) + ((sg.kind === 'bow' || sg.kind === 'gun') ? (sg.fire ? '・射撃中' : '・射撃停止') : '') : '隊ごと';
        const more = sq.classList.contains('open') ? `${groups}${sel}` : '';
        setHtml(sq, `<span>組<b>${squadCount}</b></span><span>士気<b>${sqMor}</b></span><span class="ord now">号令<b>${now}</b></span><span>陣形<b>${form}</b></span>${more}`);
        sq.setAttribute('aria-label', `自分の組 ${squadCount} 士気${sqMor} 号令${now} 陣形${form}（押すと陣形を選ぶ）`);
        sq.setAttribute('role', 'button');
      } else {
      // 十六人を超える組は、一人ずつの点でなく、生きている割合と深手の数の一本の帯で
      const many = rt.squad.length > 16;
      const bar = many ? '' : `<span class="pips">${pips}</span>`;
      // 馬の棒などで高さが変わった時に、体力・備え・組の札をまとめて積む。
      // 毎回の位置指定で観測側の配置を戻さない。
      stackBottomLeft();
      setHtml(sq, `<span>組<b>${squadCount}</b></span>${bar}<span>士気<b>${sqMor}</b></span><span>陣形<b>${form}</b></span>${groups}${sel}`);
      }
    } else setHidden(sq, true);
    // 指揮パネル
    const cp = $('cmdpanel');
    const squadLabel = String(!!p.cmdOpen);
    if ($('h-squad').getAttribute('aria-expanded') !== squadLabel) $('h-squad').setAttribute('aria-expanded', squadLabel);
    if (p.cmdOpen) {
      const opened = cp.hidden;
      setHidden(cp, false);
      let curOrd = '', hasOrder = false, sameOrder = true;
      for (const g of rt.squadGroups) {
        if (!g.count || p.selGroup !== 'all' && g.kind !== p.selGroup) continue;
        const order = g.focus ? 'focus' : g.order;
        if (!hasOrder) { curOrd = order; hasOrder = true; }
        else if (order !== curOrd) sameOrder = false;
      }
      if (!sameOrder) curOrd = '';
      // 札を叩く・押すと号令（数字キーの代わり。数字を割り当てていない号令もこれで出せる）。鍵盤の言い方は指の端末では出さない
      if (!cp.dataset.tap) {
        cp.dataset.tap = '1';
        cp.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.rt.player.cmdOpen = false; setHidden(cp, true); document.activeElement.blur?.(); return; } const b = e.target.closest('[data-cmd]'); if (b && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); e.stopPropagation(); if (!e.repeat) b.click(); } });
        cp.addEventListener('click', (e) => {
          const li = e.target.closest && e.target.closest('[data-cmd]');
          const pl = this.rt && this.rt.player;
          if (!pl || !pl.cmdOpen) return;
          if (e.target.closest('[data-radial-open]')) { pl.radialKeyboard = true; pl.radial = true; pl.cmdOpen = false; pl.tabT = null; this.updateRadial(this.rt); $('radial').querySelector('[data-radial]')?.focus({ preventScroll:true }); return; }
          if (!li) return;
          pl.command(li.dataset.cmd); pl.cmdOpen = false;
        });
      }
      const cmds = commandList(G.rank);
      let formKey = `${G.rank}:${p.selGroup}`, curForm = null, sameForm = true;
      const hasKind = rt.squadGroups.some((g) => g.kind === p.selGroup);
      for (const g of rt.squadGroups) {
        if (!g.count || p.selGroup !== 'all' && hasKind && g.kind !== p.selGroup) continue;
        const f = !groupSeen(rt, g) ? '' : g.formation === 'yari' ? 'line' : g.formation;
        formKey += ':' + f;
        if (curForm === null) curForm = f; else if (curForm !== f) sameForm = false;
      }
      if (this.squadFormKey !== formKey) {
        this.squadFormKey = formKey;
        this.squadFormHtml = '';
        if (!(G.rank < 1)) for (const c of SQUAD_FORMS) {
          const f = c.id.slice(5), on = sameForm && curForm === f;
          this.squadFormHtml += `<button type="button" data-cmd="${c.id}" aria-pressed="${on}" aria-label="${c.label}。${c.desc}">${on ? '● ' : ''}${FORM_NAME[f]}<small>${c.desc}</small></button>`;
        }
      }
      let commandHtml = '', visibleSquadCount = 0;
      for (const c of cmds) if (!c.id.startsWith('form_')) commandHtml += `<li class="${c.id === curOrd ? 'cur' : ''}" data-cmd="${c.id}" role="button" aria-pressed="${c.id === curOrd}" tabindex="0">${!isTouch && c.k ? `<kbd>${c.k}</kbd>` : ''}${c.label}${c.q && !isTouch ? `<em>${c.q}</em>` : ''}<small>${c.desc}</small></li>`;
      for (const x of rt.squad) if (sightUnit(rt, x)) visibleSquadCount++;
      const forms = this.squadFormHtml;
      setHtml(cp, `<h5>部隊指揮・${esc(GROUP_NAME[p.selGroup] || '全隊')}<span>${isTouch ? '札を指で押して号令' : '数字釦で号令、または札を押す ・ たぶで閉じる'}</span></h5><button type="button" class="btn" data-radial-open style="min-height:44px;margin:8px 0">号令の輪を開く</button><div class="squad-forms" role="group" aria-label="組の陣形">${forms}</div><ol>${commandHtml}</ol>` +
        (rt.squadGroups.length > 1 && !isTouch ? `<div class="grp">じー：号令の対象を切替　現在 <b>${GROUP_NAME[p.selGroup]}</b></div>` : '') +
        (isTouch ? '' : `<div class="grp">号令の札を開かなくても ${K('follow')}・${K('hold')}・${K('attack')}・${K('retreat')} で「ついて来い・待て・突撃・退け」</div>`) +
        `<div class="grp">見える組：${numberHint(visibleSquadCount)}。離れた者の様子は分からぬ${rt.G.rank >= 2 ? ' ・ 白い小旗が「前進」の行き先、青い輪が弓の届く範囲' : ''}</div>`);
      if (opened && this.keyboardInput) cp.querySelector('button')?.focus({ preventScroll:true });
    } else setHidden(cp, true);
    // 武器・号令ショートカット
    // 戦闘中の常設五枚は畳む。開戦直後と号令を開いた時にだけ見せ、近くの行動札は保つ。
    // 下の札は武器の持ち替えだけ（突く・狙い・話すは出さない。kaito 10/23 稲生 39）。持ち替える物が無ければ出さない。
    const weapons = p.weaponList ? p.weaponList() : [p.weapon];
    setHidden($('h-bottom'), weapons.length < 2 || !!rt.over || !u.alive);
    const pad = this.padMode;
    const bottomKey = `${pad}|${p.weapon}|${weapons.join()}`;
    if (this.bottomKey !== bottomKey) {
      this.bottomKey = bottomKey;
      const WN = { spear: ['1', '槍'], sword: ['2', '刀'], gun: ['3', '鉄砲'], bow: ['4', '弓'] };
      const slots = weapons.length > 1 ? weapons.filter((w) => WN[w]).map((w) => [pad ? '左右の釦' : `${WN[w][0]}キー`, WN[w][1], w === p.weapon]) : [];
      setHtml($('h-bottom'), slots.map(([key, label, cur]) => `<div class="slot${cur ? ' cur' : ''}"><em>${esc(key)}</em>${esc(label)}</div>`).join(''));
    }
    // 操作プロンプト
    // 倒れている間は「取る」などの札を出さない
    const rainUrgent = !guidanceEnded(rt) && rainDanger(rt.army);
    setClass(this.root, 'retreat-priority', retreatRequired(rt) || !!this.retreatGuide?.active && this.retreatGuide.valid && !this.retreatGuide.treatment || rt.missionGuide?.marker?.guideArea === 'retreat');
    setClass(this.root, 'rain-danger', rainUrgent);
    // 手当てが使える時は、門や落とし物より専用の操作札を先に出す。
    let it = u.alive ? (p.treatmentReady && rt.interacts.find(item => item.id === 'bandage')) || rt.nearestInteract() : null;
    // 森部の手当ては自動。布を巻く動きと回復する命の棒で示す。
    if (rt.def.key === 'moribe' && it?.id === 'bandage') it = null;
    const pr = $('prompt');
    const talkAction = !!it && !it.hold && /話す|話を聞く/.test(it.label);
    const talkMarker = talkAction ? rt.missionGuide?.marker : null;
    const talkPerson = talkMarker?.guideTalk && talkMarker.guidePerson?.();
    const talkPos = talkAction && (typeof it.pos === 'function' ? it.pos() : it.pos);
    const talkFrame = talkPerson?.alive && (!talkMarker.guideVisibleOnly || this.talkPersonVisible(rt, talkPerson)) && talkPos && Math.hypot(talkPos.x - talkPerson.pos.x, talkPos.z - talkPerson.pos.z) < 1 ? this.measurePersonFrame(talkPerson, rt, true) : null;
    const talkWidth = 224;
    const talkHeight = 76;
    const talkTarget = !!talkFrame && talkFrame.top > talkHeight + 76 && talkFrame.top < VIEW.h - 24 &&
      talkFrame.cx > 28 && talkFrame.cx < VIEW.w - 28;
    setClass(pr, 'talk-target', talkTarget);
    setClass(this.root, 'talk-ready', talkAction);
    if (talkTarget) {
      const left = Math.max(8, Math.min(VIEW.w - talkWidth - 8, talkFrame.cx - talkWidth / 2));
      setCssVar(pr, '--talk-x', Math.round(left) + 'px');
      setCssVar(pr, '--talk-tip-x', Math.round(talkFrame.cx - left) + 'px');
      setCssVar(pr, '--talk-y', Math.round(talkFrame.top - talkHeight - 72) + 'px');
      setCssVar(pr, '--talk-w', Math.round(talkWidth) + 'px');
      setCssVar(pr, '--talk-h', Math.round(talkHeight) + 'px');

    }
    const bandageAction = it?.id === 'bandage';
    const workAction = !!it?.hold && !/^(head|horse)/.test(it.id);
    const fireWork = workAction && /火を(?:つけ|かけ|放|移)|篝火を焚/.test(it.label);
    const workMarker = rt.missionGuide?.marker;
    const doorWork = fireWork && workMarker?.entrance && workMarker.id === it.id;
    setClass(pr, 'door-work', !!doorWork);
    setClass(pr, 'treatment-action', bandageAction);
    setClass(pr, 'work-action', workAction);
    if (workAction && !doorWork && !rainUrgent) {
      // 作業釦を任務と同じ欄へ入れる。既存の押す処理を保ったまま札を一枚にする。
      if (!this.workPromptHome) {
        this.workPromptHome = pr.parentNode;
        this.workPromptNext = pr.nextSibling;
      }
      const rail = $('battle-notices');
      if (pr.parentNode !== rail) rail.prepend(pr);
    } else if (this.workPromptHome && pr.parentNode !== this.workPromptHome) {
      this.workPromptHome.insertBefore(pr, this.workPromptNext?.parentNode === this.workPromptHome ? this.workPromptNext : null);
    }
    setClass(this.root, 'working', workAction && !rainUrgent);
    if (!workAction || this.workHoldId !== it.id) this.workHoldId = null;
    const fenceBlocked = it?.id === 'fence' && (p.blockedWalkT >= 0.7 || rt.holdId === 'fence');
    setClass(pr, 'fence-blocked', fenceBlocked);
    const actionLabel = it?.label || '', actionHold = it?.hold ? 'true' : 'false';
    if (pr.dataset.action !== actionLabel) pr.dataset.action = actionLabel;
    if (pr.dataset.hold !== actionHold) pr.dataset.hold = actionHold;
    if (it) {
      setHidden(pr, false);
      const hp = rt.holdId === it.id ? Math.max(0, Math.min(1, rt.holdPct || 0)) : 0;
      const entry = it.id.startsWith('naka_');
      const text = `${fenceBlocked ? '<strong>柵を倒して通る</strong>' : ''}${isTouch ? entry ? '' : '「使う」' : `<kbd>${pad ? 'X' : K('use')}</kbd>`}${esc(it.label)}${it.hold ? `<small>（${fenceBlocked ? `長押し・あと${Math.max(1, Math.ceil(it.hold * (1 - hp)))}秒` : '長押し'}）</small><i class="holdbar"><b style="width:${Math.round(hp * 100)}%"></b></i>` : ''}`;
      if (workAction) {
        const fire = fireWork;
        const label = bandageAction ? 'ここを長押しで手当て' : fire ? 'ここを長押しで火をつける' : it.label.replace(/（[^）]*）/g, '');
        const key = it.id + '|' + label + '|' + !!doorWork;
        if (this.workPromptKey !== key || !pr.querySelector('[data-work]')) {
          this.workHoldId = null; this.workPromptKey = key;
          setHtml(pr, `<button type="button" data-work="${esc(it.id)}"${fire ? ' class="fire-work"' : ''} aria-label="${esc(fire || bandageAction ? label : '長押しで' + label)}">${doorWork ? '<svg viewBox="0 0 36 44" aria-hidden="true"><path d="M4 42V2H32V42ZM9 38H27V7H9Z" fill="#fff3ba" stroke="#14120f" stroke-width="2"/><path d="M23 23V28" stroke="#fff3ba" stroke-width="3"/></svg>' : fire ? '<svg viewBox="-18 -36 36 44" aria-hidden="true"><path d="M0-32C3-20 16-18 14-7C12 7-14 7-14-7C-14-16-6-20-7-25L-3-20Z" fill="#fff3ba" stroke="#14120f" stroke-width="6" stroke-linejoin="round"/><path d="M0-13Q9 0 0 0Q-7 0 0-13" fill="#14120f"/></svg>' : ''}<span>${esc(label)}</span><small>長押し</small><i class="holdbar" role="progressbar" aria-label="作業の進み具合" aria-valuemin="0" aria-valuemax="100"><b></b></i></button>`);
        }
        const progress = Math.round(hp * 100);
        setStyle(pr.querySelector('.holdbar b'), 'width', `${progress}%`);
        if (fire) setCssVar(pr, '--hold-progress', `${progress}%`);
        const bar = pr.querySelector('.holdbar');
        if (bar.getAttribute('aria-valuenow') !== String(progress)) bar.setAttribute('aria-valuenow', progress);
        setClass(pr.querySelector('[data-work]'), 'holding', hp > 0);
        setText(pr.querySelector('small'), fire ? '' : bandageAction ? hp > 0 ? `手当て中・あと${Math.max(1, Math.ceil(it.hold * (1 - hp)))}秒` : `ここを${it.hold}秒押し続ける` : hp > 0 ? `${progress}％` : '長押し');
      } else { this.workPromptKey = ''; setHtml(pr, talkAction ? talkTarget ? `<button type="button" data-talk aria-label="話す"><svg viewBox="0 0 48 48" aria-hidden="true"><path d="M4 3H44V31H29L21 44L18 31H4Z" fill="#fff3ba" stroke="#14120f" stroke-width="4"/><path d="M12 12H36M12 22H30" stroke="#14120f" stroke-width="3"/></svg><span class="talk-label">話す<strong>ここをおす</strong></span></button>` : '<button type="button" data-talk><svg viewBox="0 0 48 48" aria-hidden="true"><path d="M4 3H44V31H29L21 44L18 31H4Z" fill="#fff3ba" stroke="#14120f" stroke-width="4"/><path d="M12 12H36M12 22H30" stroke="#14120f" stroke-width="3"/></svg>話す</button>' : entry ? `<button type="button" data-entry="${esc(it.id)}">${text}</button>` : text); }
    } else { this.workPromptKey = ''; setHidden(pr, true); }
    if (doorWork && this.workHoldId !== it.id && rt.holdId !== it.id) {
      // 実際の戸口の脇に押せる札を置き、押している間は位置を保つ。
      const door = typeof workMarker.pos === 'function' ? workMarker.pos() : workMarker.pos;
      if (door) {
        const q = this.project(door, (door.y ?? groundAt(rt.world, door.x, door.z, u.pos.y)) + 1, rt,
          this.workDoorProjection || (this.workDoorProjection = {}));
        const sizeKey = this.workPromptKey + '|' + VIEW.w + '|' + VIEW.h + '|' + S.textScale;
        if (this.workDoorSizeKey !== sizeKey) {
          this.workDoorSizeKey = sizeKey;
          this.workDoorWidth = pr.offsetWidth; this.workDoorHeight = pr.offsetHeight;
        }
        const width = this.workDoorWidth, height = this.workDoorHeight;
        const left = q.behind ? (VIEW.w - width) / 2 : q.x + 32 + width <= VIEW.w - 16 ? q.x + 32 : q.x - width - 32;
        setCssVar(pr, '--door-work-x', Math.round(Math.max(16, Math.min(VIEW.w - width - 16, left))) + 'px');
        setCssVar(pr, '--door-work-y', Math.round(Math.max(64, Math.min(VIEW.h - height - 56, q.behind ? VIEW.h / 2 : q.y - height / 2))) + 'px');
      }
    }
    if (talkAction) pr.querySelector('[data-talk]').dataset.talkId = it.id;
    // 首取りの距離・長押しはそのまま。札だけ亡骸の頭の脇へ逃がす。
    const headSide = it?.id.startsWith('head');
    if (headSide && !pr.hidden) {
      const foe = rt.meritKills?.find((r) => 'head' + r.foe.id === it.id)?.foe;
      const head = foe?.human?.bones?.Head || foe?.head;
      const q = head ? head.getWorldPosition(this.tmpV) : foe?.mesh?.position || foe?.pos;
      if (q) {
        this.tmpV.set(q.x, q.y + 0.3, q.z).project(rt.camera);
        const x = (this.tmpV.x * 0.5 + 0.5) * VIEW.w, y = (-this.tmpV.y * 0.5 + 0.5) * VIEW.h;
        setHidden(pr, this.tmpV.z < -1 || this.tmpV.z > 1 || Math.abs(this.tmpV.x) > 1 || Math.abs(this.tmpV.y) > 1);
        const sizeKey = it.id + ':' + VIEW.w + ':' + VIEW.h;
        if (this.headPromptSizeKey !== sizeKey && !pr.hidden) {
          this.headPromptSizeKey = sizeKey;
          this.headPromptWidth = pr.offsetWidth || 240; this.headPromptHeight = pr.offsetHeight || 48;
        }
        const pw = this.headPromptWidth || 240, ph = this.headPromptHeight || 48;
        const left = x < VIEW.w / 2 ? x + 36 : x - pw - 36;
        setStyle(pr, "left", Math.max(8, Math.min(VIEW.w - pw - 8, left)) + 'px');
        setStyle(pr, "top", Math.max(60, Math.min(VIEW.h - ph - 56, y - ph - 24)) + 'px');
        setStyle(pr, "transform", 'none');
      }
    } else if (this.headPromptSizeKey) {
      setStyle(pr, "left", ''); setStyle(pr, "top", ''); setStyle(pr, "transform", ''); this.headPromptSizeKey = '';
    }
    if (periodic & 4 && !pinGuideOn(rt)) { this.firstHelpT = 0.5; this.newPlayHelp(rt, it); }
    this.rt = rt;
    // 戦の画面では自分の組の札（右下）を作らない（kaito 10/23「部隊の印」は要らない）。
    if (pinGuideOn(rt)) setHidden($('h-units'), true);
    else if (periodic & 2) { this.unitsT = 0.2; this.updateUnits(rt); }
    if (rescue && !retreatRequired(rt)) {
      setHidden($('target'), true); setHidden($('boss'), true);
      for (const marker of this.markerEls.values()) marker.hidden = true;
    }
    this.notices.sync();
    // 印の実寸測りと小地図の計算を同じコマへ重ねない。
    if (periodic & 8) { this.markersF = 0; this.updateMarkers(rt); }
    // 中央は振り向く案内を優先し、頭の脇の間合いの札も隠して場所を空ける。
    // 印の更新を待つコマでも確かめ、向きの指図が一瞬だけ二つ出るのを防ぐ。
    if (!rangeCue.hidden) {
      for (const marker of this.markerEls.values()) {
        if (!marker.hidden && marker.offsetParent && marker.querySelector('.behind-label')) {
          setHidden(rangeCue, true);
          break;
        }
      }
    }
    this.lullCue(rt);
    this.updateThreats(rt);
    const coverVisible = !!this.coverEl && !this.coverEl.hidden;
    setClass(this.root, 'cover-guidance', coverVisible);
    if (coverVisible !== this.coverWasVisible) { this.rectsT = 0; this.coverWasVisible = coverVisible; }
    if (!this.coverEl || this.coverEl.hidden) this.releaseCoverHold?.();
    if (isTouch && this.coverEl && !this.coverEl.hidden) {
      this.releaseWaitGuard?.();
      setClass(this.root, 'wait-guard-active', false);
    }
    const safetyGoal = this.retreatGuide?.active && this.retreatGuide.valid && !this.retreatGuide.treatment ? this.retreatGuide :
      this.coverEl && !this.coverEl.hidden && rt.coverGuide?.valid ? rt.coverGuide.pos : null;
    const safetyTravel = !!safetyGoal && Math.hypot(safetyGoal.x - u.pos.x, safetyGoal.z - u.pos.z) >= (safetyGoal.radius || .8);
    const safetyChanged = this.root.classList.contains('safety-travel') !== safetyTravel;
    setClass(this.root, 'safety-travel', safetyTravel);
    if (safetyChanged) this.notices.sync();
    // 守る説明中は、移動先や歩数を重ねず同じ位置の一枚で読ませる。
    setClass(this.root, 'combat-instruction', !!this.defendEnemy?.alive);
    if (this.defendEnemy?.alive) {
      setClass(this.root, 'flag-guide', false);
    setClass(this.root, 'edge-destination', false);
      for (const marker of this.markerEls.values()) marker.hidden = true;
    }
    if (this.waitGuardButton && !this.waitGuardButton.hidden) {
      // いのち・長押し・危険の三枚まで。別の指図や人名札を重ねない。
      setHidden($('target'), true); setHidden($('boss'), true);
      for (const marker of this.markerEls.values()) marker.hidden = true;
      for (const threat of this.threatEls) threat.hidden = true;
    }
    if (this.root.classList.contains('compact-battle')) {
      // 押す行動札も三枚の中へ。記録と任務のほかは、行動・相手・行き先の順に一枚。
      const promptOn = !$('prompt').hidden;
      if (promptOn) setHidden($('boss'), true);
      const extraOn = promptOn || !$('boss').hidden;
      // 記録・今の行動・敵将（または操作）の三枚まで。ねらう敵の大枠は残す。
      if (extraOn) setHidden($('target'), true);
      if (extraOn) for (const marker of this.markerEls.values()) marker.hidden = true;
    }
    let flagShown = !!this.flagGuideDrawn;
    for (const marker of this.markerEls.values()) if (!marker.hidden && marker.classList.contains('flag-goal')) { flagShown = true; break; }
    setClass(this.root, 'flag-guide', flagShown);
    // ミニマップ
    // 小地図は見えている時だけ描く（設定で消した・手ほどきの間は描かない）
    const mapGuidance = isTouch && VIEW.h <= 500 && singleBattleGuide(rt) &&
      (this.openingActive || !!rt.missionGuide?.marker || !!this.defendEnemy?.alive ||
       !!rt.dodgeGuide || !!this.retreatGuide?.active || !!rt.touchCoachActive);
    setClass(this.root, 'map-guidance', !!mapGuidance);
    const mmOn = S.hudMinimap !== false && !this.root.classList.contains('novice') && !mapGuidance;
    // iPhone 横の 60px ほどの小さな丸の小地図は、一秒に五回で足りる（大きな地図を開いている時と、パソコンは十回）
    if (periodic & 1) { this.mmT = this.mmTiny && !this.bigmap ? 0.2 : 0.1; if (mmOn) this.drawMap($('minimap'), rt, this.mmRange || 60, true); if (this.bigmap) { this.fitBigmap(rt); this.drawMap($('bigmap'), rt, this.bigRange || 170, false); } }
  }
}
