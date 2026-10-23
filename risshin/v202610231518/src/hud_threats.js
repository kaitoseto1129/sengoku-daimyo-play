import { touchInput, isTouch } from "./touch.js";
import { setAttr, setCssVar, setStyle, setClass, setText, $, guidanceEnded, setHidden, treatmentRequired, recovering, woundRetreat, retreatRequired, rescueTarget, taskLabel, treatmentGuideText, retreatGuideText, attackOperation, dismountFirst, setHtml, esc, combatTask } from "./hud_common.js";
import { S } from "./settings.js";
import { VIEW } from "./viewport.js";
import { groundAt } from "./floors.js";
import { sightScreenUnit, sightPoint, sightUnit } from "./battle_sight.js";
import { rainDanger } from "./arrow_rain.js";
import { navigationEnemy, currentObjective, taskText } from "./mission_guide.js";
import { coverGuide } from "./cover_guide.js";

export class HudThreats {


  // 札と矢印を押す実物にまとめる。移動速度・気力・当たり判定は通常の歩行のまま。
  updateDodgeAction(rt, cue, el, side, actionable) {
    if (!this.dodgeAction) {
      const ns = 'http://www.w3.org/2000/svg';
      const marks = this.dodgeMarks = document.createElementNS(ns, 'g');
      marks.setAttribute('aria-hidden', 'true');
      marks.innerHTML = '<defs><pattern id="dodge-hatch" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M-2 2L2-2M0 10L10 0M8 12L12 8" stroke="#ffb49d" stroke-width="2"/></pattern></defs><path class="danger-floor" fill="url(#dodge-hatch)" stroke="#ffb49d" stroke-width="3"/><path class="danger-person" fill="none" stroke="#ffb49d" stroke-width="4" stroke-linejoin="round"/><g class="safe-floor" fill="none" stroke-linejoin="round"><path d="M-48 0a48 23 0 1 0 96 0a48 23 0 1 0-96 0 M-32 0a32 13 0 1 0 64 0a32 13 0 1 0-64 0 M-7-80H7V-50H18L0-28L-18-50H-7Z" stroke="#14120f" stroke-width="10"/><path d="M-48 0a48 23 0 1 0 96 0a48 23 0 1 0-96 0 M-32 0a32 13 0 1 0 64 0a32 13 0 1 0-64 0 M-7-80H7V-50H18L0-28L-18-50H-7Z" stroke="#fff3ba" stroke-width="4"/></g>';
      const dangerLabel = document.createElementNS(ns, 'text');
      dangerLabel.setAttribute('class', 'danger-label');
      dangerLabel.setAttribute('fill', '#ffb49d');
      dangerLabel.setAttribute('stroke', '#14120f');
      dangerLabel.setAttribute('stroke-width', '4');
      dangerLabel.setAttribute('paint-order', 'stroke');
      dangerLabel.setAttribute('font-size', '16');
      dangerLabel.setAttribute('font-weight', 'bold');
      dangerLabel.textContent = 'てきの攻め';
      marks.appendChild(dangerLabel);
      el.insertBefore(marks, el.firstChild);
      const box = this.dodgeAction = document.createElementNS(ns, 'foreignObject');
      box.setAttribute('height', '64');
      const button = this.dodgeButton = document.createElement('button');
      button.type = 'button'; button.className = 'dodge-button';
      button.innerHTML = '<svg class="dodge-frame" aria-hidden="true"><rect x="2%" y="4%" width="96%" height="92%" rx="6" fill="none" pathLength="100" stroke-dasharray="100" stroke-dashoffset="100"/></svg><svg class="dodge-gesture" viewBox="-4 -6 96 96" aria-hidden="true"><circle cx="44" cy="34" r="32" fill="none" stroke="#14120f" stroke-width="11"/><circle cx="44" cy="34" r="32" fill="none" stroke="currentColor" stroke-width="5"/><circle class="dodge-progress" cx="44" cy="34" r="32" fill="none" stroke="#fff" stroke-width="9" pathLength="100" stroke-dasharray="100" stroke-dashoffset="100" transform="rotate(-90 44 34)"/><g class="dodge-direction" stroke-linecap="round" stroke-linejoin="round"><path d="M44 4V-14M35-5L44-14L53-5" fill="none" stroke="#14120f" stroke-width="10"/><path d="M44 4V-14M35-5L44-14L53-5" fill="none" stroke="currentColor" stroke-width="5"/></g><path d="M38 54V34Q38 26 44 26Q50 26 50 34V48L56 44Q60 42 64 47L73 56L68 77H39L23 61Q17 53 23 49Q29 46 38 58Z" fill="currentColor" stroke="#14120f" stroke-width="4" stroke-linejoin="round"/></svg><span><b></b><small hidden></small></span>';
      this.dodgeHoldAxis = { x:0, y:0 };
      const release = this.releaseDodgeHold = () => {
        const input = touchInput();
        if (input?.axis === this.dodgeHoldAxis) input.axis = null;
        this.dodgeHeldBattle = null;
        this.dodgeDragActive = false;
        setAttr(button, 'aria-pressed', 'false');
        setCssVar(button, '--dodge-fill', '0%');
        setAttr(button.querySelector('.dodge-frame rect'), 'stroke-dashoffset', '100');
      };
      const start = () => {
        const b = this.rt;
        if (b?.dodgeGuide?.valid && !b.dodgeGuide.arrived && !b.over && !b.choice && b.player.u.alive && box.style.display !== 'none') {
          this.releaseCoverHold?.(); this.releaseWaitGuard?.();
          this.dodgeHeldBattle = b;
          // 押している間に札が逃げないよう、位置と行き先を指を放すまで保つ。
          this.dodgeHoldX = b.dodgeGuide.cardX; this.dodgeHoldY = b.dodgeGuide.cardY;
          this.dodgeHoldGoal = this.dodgeHoldGoal || { x:0, y:0, z:0 };
          Object.assign(this.dodgeHoldGoal, b.dodgeGuide.pos);
          this.dodgeHoldDistance = Math.hypot(this.dodgeHoldGoal.x - b.player.u.pos.x, this.dodgeHoldGoal.z - b.player.u.pos.z);
          setAttr(button, 'aria-pressed', 'true');
        }
      };
      button.addEventListener('pointerdown', e => {
        e.preventDefault(); e.stopPropagation();
        if (e.button !== 0) return;
        start(); button.setPointerCapture(e.pointerId);
        this.dodgePointerX = e.clientX; this.dodgePointerY = e.clientY;
        this.dodgeDragActive = false;
      });
      button.addEventListener('pointermove', e => {
        if (!button.hasPointerCapture(e.pointerId) || !this.dodgeHeldBattle) return;
        e.preventDefault(); e.stopPropagation();
        const dx = e.clientX - this.dodgePointerX, dy = e.clientY - this.dodgePointerY;
        const length = Math.hypot(dx, dy);
        if (length < 8) return;
        this.dodgeDragActive = true;
        this.dodgeDragX = dx / length; this.dodgeDragY = dy / length;
      });
      for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(name, e => { e.stopPropagation(); release(); });
      button.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); if (!e.repeat) start(); } });
      button.addEventListener('keyup', e => { e.stopPropagation(); if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); release(); } });
      button.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); });
      button.addEventListener('blur', release); window.addEventListener('blur', release);
      box.appendChild(button); el.appendChild(box);
    }
    const box = this.dodgeAction, marks = this.dodgeMarks;
    setStyle(box, 'display', actionable ? '' : 'none');
    el.setAttribute('aria-hidden', actionable ? 'false' : 'true');
    if (!actionable && this.dodgeHeldBattle) this.releaseDodgeHold();
    if (actionable) {
      setStyle(el.querySelector('.escape-card'), 'display', 'none');
      setStyle(el.querySelector('.escape-turn'), 'display', 'none');
      setStyle(el.querySelector('.escape-gesture'), 'display', 'none');
      const compact = !!rt.def.compactCombatGuides;
      setClass(this.dodgeButton, 'compact', compact);
      const label = 'ここを長く押す';
      const scale = Math.max(1, S.textScale || 1);
      const half = Math.min(Math.max((rt.def.dodgeActionHalfWidth ?? (compact ? 104 : 132)) * scale,
        (compact ? 64 : 72) / 2 + 18 + label.length * (compact ? 16 : 18) * scale / 2), (VIEW.w - 24) / 2);
      // 輪を文の札から八つ離し、文を一行で収める幅を先に確保する。
      const height = Math.ceil(Math.max(compact ? 64 : 96, rt.def.dodgeActionHeight || 0) * Math.max(1, S.textScale || 1));
      const halfHeight = height / 2;
      // 押す場所は左下に固定し、命の札との間を八つ以上あける。
      this.hudRects();
      const x = half + 12;
      const healthTop = this.healthRect?.top ?? VIEW.h - 76;
      const y = Math.max(halfHeight + 12, healthTop - 8 - halfHeight);
      cue.cardX = x; cue.cardY = y; cue.cardHalf = half;
      box.setAttribute('x', x - half); box.setAttribute('y', y - halfHeight); box.setAttribute('width', half * 2);
      box.setAttribute('height', height);
      setText(this.dodgeButton.querySelector('b'), label);
      const help = this.dodgeButton.querySelector('small');
      // 時間ではなく、押し始めた場所から退き先まで実際に歩いた割合を示す。
      const held = this.dodgeHeldBattle === rt;
      const remaining = held ? Math.hypot(this.dodgeHoldGoal.x - rt.player.u.pos.x, this.dodgeHoldGoal.z - rt.player.u.pos.z) : 0;
      const progress = held ? Math.max(0, Math.min(1, (this.dodgeHoldDistance - remaining) / Math.max(.01, this.dodgeHoldDistance - 1.1))) : 0;
      setAttr(this.dodgeButton.querySelector('.dodge-progress'), 'stroke-dashoffset', String(Math.round((1 - progress) * 100)));
      setAttr(this.dodgeButton.querySelector('.dodge-frame rect'), 'stroke-dashoffset', String(Math.round((1 - progress) * 100)));
      setCssVar(this.dodgeButton, '--dodge-fill', `${Math.round(progress * 100)}%`);
      const helpText = rt.def.dodgeActionHelp?.(rt, cue) || (held ? `あと${Math.max(1, Math.ceil(remaining))}歩` : '');
      help.hidden = !helpText;
      setText(help, helpText);
      this.dodgeButton.querySelector('.dodge-direction').setAttribute('transform', `rotate(${side === '右' ? 90 : side === '左' ? -90 : side === '後ろ' ? 180 : side === '右上' ? 45 : side === '左上' ? -45 : side === '右下' ? 135 : side === '左下' ? -135 : 0} 44 34)`);
    }
    const safe = marks.querySelector('.safe-floor');
    const goal = this.project(cue.pos, cue.pos.y + .1, rt, this.dodgeSafeProjection || (this.dodgeSafeProjection = {}));
    // 操作の指とは別に、実際の出口を示す。画面外なら端の方向印とそろえる。
    const onFloor = cue.onScreen && !goal.behind && goal.x > 56 && goal.x < VIEW.w - 56 &&
      goal.y > 96 && goal.y < VIEW.h - 32;
    // 画面外の出口を足場の輪に見せず、端では実際に進む向きの矢印にする。
    this.dodgeFloorPath ||= safe.firstElementChild.getAttribute('d');
    const floorPath = onFloor ? this.dodgeFloorPath : 'M-7-52H7V-22H18L0 0L-18-22H-7Z';
    setAttr(safe.firstElementChild, 'd', floorPath);
    setAttr(safe.lastElementChild, 'd', floorPath);
    setStyle(safe, 'display', onFloor || cue.rain ? '' : 'none');
    safe.setAttribute('transform', `translate(${onFloor ? goal.x : cue.markX} ${onFloor ? goal.y : cue.markY})${onFloor ? '' : ` rotate(${this.destinationDirection(rt, cue.pos) * 180 / Math.PI - 90})`}`);
    let enemy = cue.source;
    if (cue.rain) {
      let nearest = Infinity;
      for (const volley of rt.army._rain?.volleys || []) {
        if (volley.t >= volley.T + .6 || volley.team === rt.player.u.team) continue;
        const distance = Math.hypot(rt.player.u.pos.x - volley.x, rt.player.u.pos.z - volley.z);
        if (distance < volley.r + 4 && distance < nearest) { nearest = distance; enemy = volley.owner; }
      }
    }
    const frame = enemy?.alive && this.combatEnemyVisible(rt, enemy) && this.measurePersonFrame(enemy, rt);
    const person = marks.querySelector('.danger-person');
    setStyle(person, 'display', frame ? '' : 'none');
    if (frame) {
      const x = frame.cx, y = Math.max(48, frame.top - 12);
      person.setAttribute('d', `M${x-5} ${y+6}L${x+9} ${y-22}L${x+15} ${y-28}L${x+14} ${y-17}L${x} ${y+10}Z M${x-10} ${y+3}L${x+6} ${y+11}M${x-3} ${y+8}L${x-9} ${y+20}`);
    }
    // 射線のうち本人の近く、近接なら実際の武器の届く扇を床へ投影する。
    // 矢の雨は既存の落下範囲の斜線を使い、別の範囲を作らない。
    const area = marks.querySelector('.danger-floor');
    setStyle(area, 'display', 'none');
    const dangerLabel = marks.querySelector('.danger-label');
    setStyle(dangerLabel, 'display', 'none');
    // 急な坂で床の範囲が兵へ重なる戦は、敵の印と回避先だけを残す。
    if (rt.def.dodgeDangerFloor === false) return;
    if (!enemy?.alive || cue.rain) return;
    const attack = enemy.atk || enemy.swing;
    const ranged = enemy.type === 'bow' || enemy.type === 'gun' || attack?.ranged || attack?.bow;
    if (!ranged && (!attack || attack.target !== rt.player.u || attack.done)) return;
    const p = rt.player.u.pos, dx = p.x - enemy.pos.x, dz = p.z - enemy.pos.z, distance = Math.hypot(dx, dz) || 1;
    const ux = ranged ? dx / distance : Math.sin(enemy.heading), uz = ranged ? dz / distance : Math.cos(enemy.heading);
    const start = ranged ? Math.max(0, distance - 5) : .3, end = ranged ? distance + 1 : enemy.reach || 2;
    const point = this.dodgeDangerPoint || (this.dodgeDangerPoint = { x:0, y:0, z:0 });
    const screen = this.dodgeDangerProjection || (this.dodgeDangerProjection = {});
    let path = '', labelX = 0, labelY = 0;
    for (let i = 0; i < 4; i++) {
      const along = i < 2 ? start : end, across = (i === 0 || i === 3 ? -1 : 1) * (ranged ? .65 : along * .55);
      point.x = enemy.pos.x + ux * along - uz * across; point.z = enemy.pos.z + uz * along + ux * across;
      point.y = groundAt(rt.world, point.x, point.z, p.y);
      if (!this.floorGoalVisible(rt, point, false)) return;
      this.project(point, point.y + .08, rt, screen);
      if (screen.behind) return;
      labelX += screen.x / 4; labelY += screen.y / 4;
      path += `${i ? 'L' : 'M'}${screen.x} ${screen.y}`;
    }
    area.setAttribute('d', path + 'Z'); setStyle(area, 'display', '');
    dangerLabel.setAttribute('x', Math.max(12, Math.min(VIEW.w - 92, labelX)));
    dangerLabel.setAttribute('y', Math.max(80, Math.min(VIEW.h - 32, labelY)));
    setStyle(dangerLabel, 'display', '');
  }


  combatEnemyVisible(rt, enemy) {
    if (!sightScreenUnit(rt, enemy)) return false;
    const cache = this.combatSightCache || (this.combatSightCache = new WeakMap());
    let c = cache.get(enemy);
    if (!c) { c = { rt: null, at: -1, seen: false }; cache.set(enemy, c); }
    if (c.rt === rt && rt.t >= c.at && rt.t - c.at < .1) return c.seen;
    c.rt = rt; c.at = rt.t; c.seen = false;
    const a = rt.camera.position, b = enemy.pos;
    const dx = b.x - a.x, dz = b.z - a.z, d2 = dx * dx + dz * dz;
    if (d2 < .01) return c.seen = true;
    // 頭と胴のどちらかが見える相手を使う。自分の背は除く。
    for (let i = 0; i < 2; i++) {
      const height = enemy.mounted ? (i ? 1.6 : 2.4) : i ? .8 : 1.6;
      if (!sightPoint(rt, b, 170, true, height)) continue;
      const by = b.y + height;
      let blocked = false;
      for (const u of rt.army.units) {
        if (u === enemy || u === rt.player.u || !u.alive || u.gone || u.isStruct || u.mesh?.visible === false) continue;
        const t = ((u.pos.x - a.x) * dx + (u.pos.z - a.z) * dz) / d2;
        if (t <= 0 || t >= 1) continue;
        const ex = a.x + dx * t - u.pos.x, ez = a.z + dz * t - u.pos.z;
        const y = a.y + (by - a.y) * t - u.pos.y;
        if (ex * ex + ez * ez < (u.mounted ? .65 : .32) ** 2 && y > .35 && y < (u.mounted ? 2.7 : 1.9)) {
          blocked = true; break;
        }
      }
      if (!blocked) return c.seen = true;
    }
    return false;
  }


  updateThreats(rt) {
    setClass($('objectives'), 'immediate-action', false);
    // 防いだ実際の一撃だけを反撃の合図にする。同じ合図は八秒あける。
    const hit = rt.player.lastHit;
    if (hit && !hit.ranged && !hit.guardBroken && (hit.blocked || hit.guard && rt.player.counterT > 0) &&
        rt.t - hit.t < .25 && hit.t !== this.counterPromptHit && rt.t - (this.counterPromptAt ?? -Infinity) >= 8) {
      this.counterPromptHit = hit.t; this.counterPromptAt = rt.t;
      this.counterPromptUntil = rt.t + (rt.player.counterT > 0 ? rt.player.counterT : .9);
      this.counterPromptEnemy = hit.source;
    }
    const counter = this.counterPromptEnemy;
    this.counterGuideEnemy = isTouch && rt.t < this.counterPromptUntil && counter?.alive &&
      !rt.player.pending && rt.player.sta > 0 && rt.player.guardBroken <= 0 &&
      Math.hypot(counter.pos.x - rt.player.u.pos.x, counter.pos.z - rt.player.u.pos.z) <= rt.player.meleeReach(rt.player.weapon === 'sword' ? 'slash' : 'thrust') ? counter : null;
    if (!guidanceEnded(rt) && !this.openingActive && rainDanger(rt.army)) {
      if (this.retreatGuide) this.retreatGuide.active = false;
      if (this.coverEl) this.coverEl.hidden = true;
      this.guardAlly = this.defendEnemy = this.attackGuideEnemy = this.approachGuideEnemy = this.guardThreat = null;
      for (const el of this.threatEls) el.hidden = true;
      setClass($('objectives'), 'turn-coach', false);
      if (this.actionLabel) { setHidden(this.actionLabel, true); setClass($('objectives'), 'has-action', false); }
      setHidden($('boss'), true); setHidden($('target'), true);
      setClass(this.root, 'guard-button-help', false);
      // 矢の危険中は落下範囲からの回避だけを先に示す。近接の敵一覧は、この分岐の後で集める。
      // 避ける案内の札を出さない戦では、落ちる所の地面の印だけで分からせる（kaito 10/23 稲生 4）。
      if (rt.army.rainEscape && !rt.def.noDodgeCard) this.showDodge(rt, null);
      else {
        rt.dodgeGuide = null;
        setClass(this.root, 'dodge-active', false);
        setClass(this.root, 'dodge-turn-coach', false);
        if (rt.dodgeRing) rt.dodgeRing.visible = false;
        if (this.dodgeEl) setStyle(this.dodgeEl, 'display', 'none');
      }
      return;
    }
    const treatmentNeeded = treatmentRequired(rt);
    const nearWarning = rt.def.nearThreatWarning || rt.def.key === 'okehazama' || rt.def.key === 'moribe';
    // 指定した戦の移動中は、周囲の空き地より任務の退き口を優先する。矢の落下範囲の警告は上で残す。
    if (recovering(rt) || rt.def.routeGuidePriority?.(rt) && !woundRetreat(rt) && !navigationEnemy(rt) && !rt.army.rainEscape || (!retreatRequired(rt) && !rescueTarget(rt) && !treatmentNeeded && !nearWarning && !rt.def.attackWarningDelay && !rt.def.rangedWarning && !rt.army.rainEscape && !this.root.classList.contains('compact-battle')) || guidanceEnded(rt) || this.openingActive) {
      rt.dodgeGuide = null;
      setClass(this.root, 'dodge-active', false);
      setClass(this.root, 'dodge-turn-coach', false);
      if (rt.dodgeRing) rt.dodgeRing.visible = false;
      if (this.dodgeEl) setStyle(this.dodgeEl, 'display', 'none');
      this.guardAlly = this.defendEnemy = this.attackGuideEnemy = this.approachGuideEnemy = this.guardThreat = null;
      if (this.retreatGuide) this.retreatGuide.active = false;
      setClass(this.root, 'guard-button-help', false);
      if (this.coverEl) this.coverEl.hidden = true;
      for (const el of this.threatEls) el.hidden = true;
      setClass($('objectives'), 'turn-coach', false);
      if (this.actionLabel) { setHidden(this.actionLabel, true); setClass($('objectives'), 'has-action', false); }
      return;
    }
    if (this.threatAt > rt.t) return;
    this.threatAt = rt.t + 0.1;
    const hadGuardWait = !!this.guardWait?.active;
    if (this.guardWait) this.guardWait.active = false;
    if (this.retreatGuide) this.retreatGuide.active = false;
    setClass(this.root, 'guard-button-help', false);
    if (rt.dodgeRing) rt.dodgeRing.visible = false;
    rt.dodgeGuide = null;
    setClass(this.root, 'dodge-active', false);
    setClass(this.root, 'dodge-turn-coach', false);
    if (this.dodgeEl) setStyle(this.dodgeEl, 'display', 'none');
    this.guardThreat = null;
    const previousDefender = this.defendEnemy;
    let retainedMelee = null;
    this.guardAlly = this.defendEnemy = this.attackGuideEnemy = this.approachGuideEnemy = null;
    if (this.coverEl) this.coverEl.hidden = true;
    const p = rt.player.u, W = VIEW.w, H = VIEW.h;
    const viewYaw = rt.player.yaw + (rt.def.rearThreatFrame ? rt.player.camYawOff || 0 : 0);
    const sources = this.threatSources || (this.threatSources = []), distances = this.threatDistances || (this.threatDistances = []);
    const directions = this.threatDirections || (this.threatDirections = []);
    sources.length = 0; distances.length = 0; directions.length = 0;
    for (const u of rt.army.units) {
      if (!u.alive || u.gone || u.team === p.team || u.fleeing || u.woundOut || u.noTarget || u.civ || u.isStruct || u.type === 'dummy' || u.type === 'porter' || u.playerOpeningBlocked) continue;
      const d = Math.hypot(u.pos.x - p.pos.x, u.pos.z - p.pos.z);
      const aimed = u.target === p || u.atk?.target === p || u.swing?.target === p;
      let flying = false;
      for (const a of rt.army.arrows || []) if (a.owner === u && !a.stuck && a.life > 0) {
        const dx = p.pos.x - a.pos.x, dz = p.pos.z - a.pos.z;
        const dot = dx * a.vel.x + dz * a.vel.z;
        const miss = Math.abs(dx * a.vel.z - dz * a.vel.x) / (Math.hypot(a.vel.x, a.vel.z) || 1);
        if (dot > 0 && miss < 3 && Math.hypot(dx, dz) < 35) { flying = true; break; }
      }
      const ranged = flying || !!(u.atk?.bow || u.atk?.ranged) || !u.sidearm && (u.type === 'bow' || u.type === 'gun') && d > 4;
      // 狭間から撃てる射線は壁の単純判定で消さない。発射前に射手側で確かめた予告を使う。
      const called = ranged && u.shotWarnUntil > rt.army.time && d < 90;
      // 指定した戦では、玉込め中の狙い先だけで矢玉の札を出し続けない。
      if (ranged && rt.def.rangedThreatNeedsShot && !called && !flying && !(aimed && u.atk?.bow)) continue;
      if (!ranged && !nearWarning && !rt.def.attackWarningDelay && !this.root.classList.contains('compact-battle')) continue;
      // 指定した戦の近接警告だけ、届かない距離や別の段の兵を除く。矢玉の予告は残す。
      if (!ranged && (d > (rt.def.meleeThreatRange ?? 12) ||
        Math.abs(u.pos.y - p.pos.y) > (rt.def.meleeThreatHeight ?? Infinity))) continue;
      const close = (nearWarning || this.root.classList.contains('compact-battle')) && d < (rt.def.nearThreatRange ?? 12);
      if (!called && !flying && ((!close && !aimed) || d > (ranged ? 90 : 12) || rt.army.wallBetween(u.pos, -1, p.pos) || rt.army.terrainBlocks(u.pos, p.pos))) continue;
      // 壁越し・画面外の敵には向きを教えず、通れる道の案内を残す。
      if (!ranged && !this.combatEnemyVisible(rt, u)) continue;
      if (!ranged && u.atk?.target === p && u.atk.t > 0 && sightScreenUnit(rt, u) &&
          (!this.guardThreat || d < Math.hypot(this.guardThreat.pos.x - p.pos.x, this.guardThreat.pos.z - p.pos.z))) this.guardThreat = u;
      // 近さが入れ替わっても、生きて見える同じ相手を案内する。射撃の警告は優先する。
      if (u === previousDefender && !ranged && sightScreenUnit(rt, u)) retainedMelee = u;
      const score = flying ? Math.min(d, 6) : d;
      const angle = Math.atan2(u.pos.x - p.pos.x, u.pos.z - p.pos.z) - viewYaw;
      const direction = Math.cos(angle) > .5 ? 0 : Math.cos(angle) < -.5 ? 1 : Math.sin(angle) > 0 ? 2 : 3;
      // 同じ向きは一枚にまとめ、一番近い危険を残す。
      const duplicate = directions.indexOf(direction);
      if (duplicate >= 0) {
        if (distances[duplicate] <= score) continue;
        sources.splice(duplicate, 1); distances.splice(duplicate, 1); directions.splice(duplicate, 1);
      }
      let at = 0; while (at < sources.length && distances[at] <= score) at++;
      if (at >= 3) continue;
      for (let i = Math.min(2, sources.length); i > at; i--) { sources[i] = sources[i - 1]; distances[i] = distances[i - 1]; directions[i] = directions[i - 1]; }
      sources[at] = u; distances[at] = score; directions[at] = direction;
    }
    // 任務・語り・相手の場面の札も数え、方角の札を合わせて三枚まで。
    const target = $('target');
    const oke = rt.def.key === 'okehazama';
    if (treatmentNeeded) this.retreatDestination(rt, sources[0], true);
    if (this.root.classList.contains('compact-battle') || retreatRequired(rt) || treatmentNeeded || rescueTarget(rt)) {
      // 別々の方向札を作らず、今の行動を任務と同じ一枚で伝える。
      const nearest = sources[0];
      const rangedFirst = nearest && (!nearest.sidearm && (nearest.type === 'bow' || nearest.type === 'gun') || nearest.atk?.bow || nearest.atk?.ranged);
      const counterVisible = this.counterGuideEnemy && this.combatEnemyVisible(rt, this.counterGuideEnemy);
      // 遠い相手に固定せず、間合いに入った見える敵へ渡す。
      const retain = retainedMelee && (!nearest || Math.hypot(retainedMelee.pos.x - p.pos.x, retainedMelee.pos.z - p.pos.z) <= distances[0] + 1);
      const u = (counterVisible && this.counterGuideEnemy) || (!rangedFirst && this.guardThreat) || (!rangedFirst && retain && retainedMelee) || nearest;
      const ranged = u && (!u.sidearm && (u.type === 'bow' || u.type === 'gun') || u.atk?.bow || u.atk?.ranged);
      const angle = u ? Math.atan2(u.pos.x - p.pos.x, u.pos.z - p.pos.z) - viewYaw : 0;
      const coverHelp = rt.def.key === 'honnoji' && rt.t < (rt.flags.coverHelpUntil || 0);
      const cover = coverHelp ? coverGuide(rt, rt.flags.coverSources || sources) : ranged ? coverGuide(rt, sources) : null;
      const coverReached = !!cover && Math.hypot(cover.x - p.pos.x, cover.z - p.pos.z) < .8;
      const dodge = !cover && !rt.def.noDodgeCard && (!woundRetreat(rt) && ranged || rt.army.rainEscape) ? this.showDodge(rt, ranged ? u : null) : null;
      // 目に見えて近くで戦う仲間を一人だけ示す。選んだ相手は生存・距離・見通しが保たれる間は替えない。
      const rescue = rescueTarget(rt);
      const meleeAllowed = rt.def.meleeGuide?.(rt, u) !== false;
      const missionGuard = rescue || (rt.def.guardGuideTarget?.(rt) || rt.def.guardTarget?.(rt));
      let guard = missionGuard || this.lastGuardAlly;
      const guardOrder = !!missionGuard || /仲間.*守れ|組のそばで受け/.test(taskLabel(rt, currentObjective(rt)?.text || ''));
      const canGuard = (a) => {
        if (a && a === rescue) return true;
        if (!a || a === p || !a.alive || a.gone || a.fleeing || a.woundOut || a.noTarget || a.civ || a.isStruct ||
            a.type === 'dummy' || a.type === 'porter' || a.invuln && !a.name ||
            a.team !== p.team || Math.hypot(a.pos.x - p.pos.x, a.pos.z - p.pos.z) >= (a === this.lastGuardAlly ? 24 : 12) ||
            (!u && !guardOrder) || (!guardOrder && u && Math.hypot(a.pos.x - u.pos.x, a.pos.z - u.pos.z) >= 10) || !sightUnit(rt, a)) return false;
        // 足元だけ見える仲間を選ばない。兜・足・頭上の札まで携帯の中へ収める。
        if (!missionGuard && !guardOrder) {
          for (let i = 0; i < 4; i++) {
            const radius = a.mounted ? 1.4 : .65;
            this.tmpV.set(a.pos.x + (i & 1 ? radius : -radius), a.pos.y + (i & 2 ? a.mounted ? 3.3 : 2.35 : 0), a.pos.z).project(rt.camera);
            const x = (this.tmpV.x * .5 + .5) * W, y = (-this.tmpV.y * .5 + .5) * H;
            if (this.tmpV.z < -1 || this.tmpV.z > 1 || x < 120 || x > W - 120 || y < 112 || y > H - 48) return false;
          }
        }
        return true;
      };
      const objective = currentObjective(rt);
      const movingOrder = !guardOrder && /旗|進め|向か|続け/.test(taskText(rt, objective?.text || ''));
      const guardAllowed = rt.def.guardGuideAllowed?.(rt) !== false &&
        (!!rescue || meleeAllowed && !movingOrder && (guardOrder || !rt.missionGuide?.marker) && !rt.nearestInteract());
      if (!guardAllowed) guard = null;
      if (guardAllowed && !canGuard(guard)) {
        guard = null; let best = Infinity;
        if (!missionGuard && (u || guardOrder) && !ranged) for (const a of rt.army.units) {
          if (!canGuard(a)) continue;
          const d = Math.hypot(a.pos.x - p.pos.x, a.pos.z - p.pos.z);
          if (d < best) { best = d; guard = a; }
        }
      }
      // 守る人が近くても、届く敵のすきには攻撃する相手を示す。
      const opening = u && !ranged && !this.guardThreat && !u.fleeing && !u.woundOut &&
        Math.hypot(u.pos.x - p.pos.x, u.pos.z - p.pos.z) <= rt.player.meleeReach(rt.player.weapon === 'sword' ? 'slash' : 'thrust') &&
        this.combatEnemyVisible(rt, u) && (rt.def.attackOpening ? rt.def.attackOpening(rt, u) : !u.atk && (!u.swing || u.swing.done));
      if (!rescue && meleeAllowed && opening) guard = null;
      this.lastGuardAlly = guard;
      if (dodge && this.retreatGuide) this.retreatGuide.active = false;
      const urgentRetreat = retreatRequired(rt);
      const retreatNeeded = !dodge && (urgentRetreat || treatmentNeeded || p.hp < p.maxHp * .3 || p.mobbed || rt.player.sta < 20 || rt.missionGuide?.marker?.guideArea === 'retreat');
      let retreat = retreatNeeded ? this.retreatDestination(rt, u,
        rt.missionGuide?.marker?.guideArea !== 'retreat' && treatmentNeeded && (!urgentRetreat || woundRetreat(rt) || rt.def.preferTreatmentRetreat?.(rt))) : null;
      // 手当てできる陰が見つからなくても、歩ける退き先の矢印を残す。
      if (!retreat && retreatNeeded && woundRetreat(rt)) retreat = this.retreatDestination(rt, u);
      const retreatReached = retreat && Math.hypot(retreat.x - p.pos.x, retreat.z - p.pos.z) < retreat.radius;
      let action = dodge ? '' :
        retreat?.treatment ? treatmentGuideText(rt, retreat) :
        urgentRetreat ? retreatGuideText(rt, retreatReached, 'こっちへ にげる') :
        retreatNeeded ? treatmentNeeded ? treatmentGuideText(rt, retreat) :
          retreatGuideText(rt, retreatReached, 'こっちへ にげる') :
        cover ? coverReached ? '' : rt.coverGuide.label : ranged ? rt.def.compactGunAction || `${u?.type === 'gun' ? '鉄砲' : '矢'}！ 柱や壁のうしろへ` :
        guard ? rescue ? 'この人をたすけよう' : rt.def.guardLabel?.(rt, guard) || 'この人を守れ' : u && meleeAllowed ? '敵へ向いて かまえる' : '';
      this.guardAlly = !dodge && !retreatNeeded && !cover && !ranged ? guard : null;
      const meleeHelp = !!u && !ranged && action === '敵へ向いて かまえる' && rt.player.weapon !== 'bow' && rt.player.weapon !== 'gun';
      // 届かない相手には前進を教える。本人への打ち込み中は防ぐ案内を優先する。
      const reach = meleeHelp ? rt.player.meleeReach(rt.player.weapon === 'sword' ? 'slash' : 'thrust') : 0;
      // 長押しを始めたら、実際に一撃を守るまで移動・攻撃へ案内を飛ばさない。
      const guardingFirst = isTouch && (this.waitGuardHeldBattle === rt || rt.player.guard) &&
        !(rt.stats.blocks > 0) && !this.counterGuideEnemy;
      const approachHelp = meleeHelp && !guardingFirst && !this.guardThreat &&
        Math.hypot(u.pos.x - p.pos.x, u.pos.z - p.pos.z) > reach;
      this.approachGuideEnemy = approachHelp ? u : null;
      const attackHelp = meleeHelp && !guardingFirst && !approachHelp && (this.counterGuideEnemy === u ||
        (rt.def.attackOpening ? rt.def.attackOpening(rt, u) : !this.guardThreat && !u.atk && (!u.swing || u.swing.done)));
      this.attackGuideEnemy = attackHelp ? u : null;
      const guardHelp = meleeHelp && !attackHelp && !approachHelp;
      if (meleeHelp) {
        this.defendEnemy = u;
        const facing = Math.cos(Math.atan2(u.pos.x - p.pos.x, u.pos.z - p.pos.z) - rt.player.yaw);
        this.guardFacing = facing > (this.guardFacing ? .85 : .94);
        action = approachHelp ? this.meleeApproachText(rt) || 'はたへ すすもう' : !this.guardFacing ? isTouch ? rt.def.meleeTurnText || `${Math.sin(angle) <= 0 ? '右' : '左'}へ なぞる` : rt.player.weapon === 'spear' ? '敵にやりを向けよう' : '敵へ向こう' :
          attackHelp ? attackOperation(rt) :
          rt.player.guard ? isTouch ? this.waitGuardHeldBattle === rt ? '押したまま ふせぐ' : rt.def.guardWaitText || 'この中で まもれ' : rt.def.guardWaitText || (S.guardToggle ? '構えたまま ふせぐ' : '右押しを押したまま') :
          isTouch ? rt.def.guardStartText || 'この中で まもれ' : S.guardToggle ? '右押しを一度押す' : '右押しを押し続ける';
        if (!isTouch && rt.teachOn && !rt.teachOn() && /クリック|押|なぞ/.test(action)) action = !this.guardFacing ? '敵へ むこう' : attackHelp ? 'たたけ' : 'ふせぐ';
        setClass(this.root, 'guard-button-help', guardHelp && isTouch && this.guardFacing && !rt.player.guard);
      } else {
        this.guardFacing = false;
      }
      const turnCoach = isTouch && meleeHelp && !approachHelp && !this.guardFacing;
      const turnRight = Math.sin(Math.atan2(u?.pos.x - p.pos.x, u?.pos.z - p.pos.z) - rt.player.yaw) <= 0;
      setClass($('objectives'), 'turn-coach', turnCoach);
      if (turnCoach) {
        // 見回す側の空いた上半分へ。左右の操作を入れ替えた時も追従する。
        setCssVar($('objectives'), '--turn-coach-x', (S.touchSwap ? 56 : W - 296) + 'px');
        setCssVar($('objectives'), '--turn-coach-y', Math.max(84, H * .24) + 'px');
      }
      // 「ここ」は構え始めた足元。移動や敵の動きで待つ輪を引きずらない。
      if (guardHelp && this.guardFacing && rt.player.guard) {
        const cue = this.guardWait || (this.guardWait = { pos: { x: 0, y: 0, z: 0 }, guideArea: 'wait', guideRadius: 1 });
        if (!hadGuardWait || cue.rt !== rt || cue.enemy !== u) {
          cue.pos.x = p.pos.x; cue.pos.y = p.pos.y; cue.pos.z = p.pos.z;
        }
        cue.rt = rt; cue.enemy = u; cue.active = true;
      }
      if (this.actionLabel) {
        // 印の形と行動を対応させ、向きの矢印だけでは戦い方を迷わせない。
        if (rt.teachOn && !rt.teachOn()) {
          // 手ほどきを終えた後も、戦固有の「列を守れ」「旗へ戻れ」を残す。
          if (meleeHelp && !guardHelp) action = approachHelp ? this.meleeApproachText(rt) || 'はたへ すすもう' : !this.guardFacing ? '敵へ向こう' : rt.def.enemyTaskLabel?.(rt, u) || attackOperation(rt);
          else if (this.guardAlly && !retreatNeeded && !dodge) action = rescue ? 'この人をたすけよう' : rt.def.guardLabel?.(rt, this.guardAlly) || 'この人を守れ';
        }
        const swipeApproach = this.openingActive && approachHelp && isTouch &&
          Math.cos(Math.atan2(u.pos.x - p.pos.x, u.pos.z - p.pos.z) - rt.player.yaw) >= .9;
        if (swipeApproach) action = '上へなぞって近づく';
        setClass(this.actionLabel, 'approach-swipe', swipeApproach);
        setClass(this.actionLabel, 'attack-action', attackHelp && this.guardFacing);
        setClass(this.actionLabel, 'spear-action', attackHelp && this.guardFacing && rt.player.weapon === 'spear');
        setClass($('objectives'), 'attack-help', attackHelp && this.guardFacing);
        setClass(this.actionLabel, 'cover-action', false);
        setClass(this.actionLabel, 'guard-action', meleeHelp && !approachHelp && !this.guardFacing);
        setCssVar(this.actionLabel, '--enemy-angle', Math.atan2(-Math.cos(angle), -Math.sin(angle)).toFixed(3) + 'rad');
        const attack = rt.player.weapon === 'sword' ? 'きる' : rt.player.weapon === 'bow' ? '射る' : rt.player.weapon === 'gun' ? '攻撃' : 'つく';
        const help = approachHelp ? '' : rt.teachOn && !rt.teachOn() ? '' : attackHelp && this.guardFacing ? isTouch ? '' : '左押しで突く' : this.guardAlly && !(isTouch && this.attackGuideEnemy) ? isTouch ? rt.player.weapon === 'gun' ? '攻撃の釦を押し続けて狙い、離して撃つ' : `「${attack}」を押す` : rt.player.weapon === 'gun' ? '左押しを押し続けて狙い、離して撃つ' : '敵へ向き、左押しで突く' : '';
        const dismount = dismountFirst(rt);
        setHtml(this.actionLabel, dismount ? `<button type="button" class="dismount-action"${rt.player.mountT > 0 ? ' disabled' : ''}>馬をおりる</button>` :
          turnCoach && this.openingActive && (!rt.teachOn || rt.teachOn()) ? `${esc(action)}<svg class="turn-gesture" viewBox="0 0 200 82" aria-hidden="true"><g transform="${turnRight ? '' : 'translate(200 0) scale(-1 1)'}"><circle cx="32" cy="24" r="17" fill="none" stroke="#fff3ba" stroke-width="3"/><circle cx="168" cy="24" r="17" fill="none" stroke="#fff3ba" stroke-width="3" stroke-dasharray="4 4"/><path d="M51 24H148M136 15L148 24L136 33" fill="none" stroke="#fff3ba" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M26 40V24Q26 16 32 16Q38 16 38 24V36Q44 31 48 37Q55 35 58 43L56 53Q55 59 47 59H34Q28 59 24 52L14 40Q10 32 16 31Q20 29 26 40Z" fill="#fff3ba" stroke="#14120f" stroke-width="3" stroke-linejoin="round"/></g><g fill="#fff3ba" font-size="13" font-family="sans-serif" text-anchor="middle"><text x="${turnRight ? 32 : 168}" y="78">ここから</text><text x="${turnRight ? 168 : 32}" y="78">ここまで</text></g></svg>` :
          swipeApproach ? `<svg class="enemy-swipe" viewBox="0 0 64 96" aria-hidden="true"><path d="M32 36V6M19 19L32 6L45 19" fill="none" stroke="#fff3ba" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/><circle cx="32" cy="54" r="24" fill="none" stroke="#fff3ba" stroke-width="3"/><path d="M27 76V54q0-10 10-4v18l7-4 12 10-4 18H28L14 76q-6-12 4-10Z" fill="#fff3ba" stroke="#14120f" stroke-width="3" stroke-linejoin="round"/></svg><span>上へなぞって近づく</span>` :
          approachHelp && isTouch ? esc(action) :
          retreat?.treatment ? esc(action) :
          `${guardHelp ? '<span class="guard-caption"><i class="guard-sign" aria-hidden="true"></i>' : ''}${esc(action)}${guardHelp ? '</span>' : ''}${help ? `<small>${esc(help)}</small>` : ''}`);
        // 操作を任務の一枚へまとめる。下馬を明示する戦は押せる釦を保つ。
        const singleTask = !dismount && (this.combatActionUnified || approachHelp && isTouch || !swipeApproach &&
          (!!combatTask(rt) || !!rt.def.singleTaskGuide || approachHelp && !!rt.def.hideApproachAction));
        setHidden(this.actionLabel, singleTask || !action || !!retreat && !dismount);
        setClass($('objectives'), 'has-action', !singleTask && !!action && (!retreat || dismount));
        setClass($('objectives'), 'immediate-action', !singleTask && meleeHelp && !!action && !retreat);
        if (singleTask) setClass($('objectives'), 'attack-help', false);
      }
      this.okeThreatActive = !!u;
      if (this.guardAlly || meleeHelp || dodge || retreat || retreatNeeded) {
        setHidden($('target'), true);
        setHidden($('boss'), true);
      }
      for (const el of this.threatEls) el.hidden = true;
      // 記録の入口・今の行動・相手か行き先の三枚まで。
      let markerRoom = !action && $('boss').hidden && $('choice').hidden ? 1 : 0;
      for (const marker of this.markerEls.values()) if (!marker.hidden) {
        if (markerRoom > 0) markerRoom--; else marker.hidden = true;
      }
      this.notices.sync();
      if (cover && !coverReached && !retreatNeeded && !dodge && this.showCover(rt, cover) && this.actionLabel) {
        action = Math.hypot(cover.x - p.pos.x, cover.z - p.pos.z) < .8 ? 'そのままかくれよう' : rt.coverGuide.label;
        setClass(this.actionLabel, 'cover-action', true);
        setText(this.actionLabel, action);
        setHidden(this.actionLabel, true);
        // 操作文を戻る案内へ移した後は、空の任務札を残さない。
        setClass($('objectives'), 'has-action', false);
      }
      return;
    }
    setClass($('objectives'), 'turn-coach', false);
    if (rt.army.rainEscape && !rt.def.noDodgeCard) this.showDodge(rt, null);
    if (this.actionLabel) { setHidden(this.actionLabel, true); setClass($('objectives'), 'has-action', false); }
    if (rt.def.key === 'honnoji' && rt.t < (rt.flags.coverHelpUntil || 0) && rt.coverGuide?.valid) {
      for (const marker of this.markerEls.values()) marker.hidden = true;
      if (this.showCover(rt, rt.coverGuide.pos)) {
        for (const el of this.threatEls) el.hidden = true;
        return;
      }
    }
    if (oke) {
      this.okeThreatActive = sources.length > 0;
      this.notices.sync();
      if (this.okeThreatActive || this.notices.picks.length >= 2) for (const marker of this.markerEls.values()) marker.hidden = true;
    }
    let markerCount = 0;
    for (const marker of this.markerEls.values()) if (!marker.hidden) markerCount++;
    const warningShown = this.notices.picks.some((item) => item.kind === 'warn');
    const operation = !!rt.touchCoachActive || !!rt.nearestInteract() || (!rt.def.town && !rt.def.dojo && (p.wounds?.bleed > 0.0001 || p.hp < p.maxHp * 0.6));
    const room = $('choice').hidden && !warningShown ? Math.max(0, (oke ? 2 : 3) - Number(operation) - markerCount - this.notices.picks.length - (!$('boss').hidden ? 1 : 0) - (!target.hidden && !target.classList.contains('notice-muted') ? 1 : 0)) : 0;
    const count = Math.min(sources.length, room);
    for (let n = count; n < this.threatEls.length; n++) this.threatEls[n].hidden = true;
    const placed = this.threatRects;
    placed.length = 0;
    if (rt.def.avoidWaymarkThreats || rt.def.key === 'mikatagahara') for (const marker of this.markerEls.values()) {
      // 印の実寸と置き場は印を置いた時に覚えてある（毎コマ測ると、札を書くたびに組み直しが起きて重い）。
      // .mk は translate(-50%, -100%) なので、置いた点の上に幅・高さの箱がある。
      if (marker.hidden || marker._ow == null || marker._px == null) continue;
      const hx = marker._ow / 2;
      const box = { left:marker._px - hx - 8, right:marker._px + hx + 8, top:marker._py - marker._oh - 32, bottom:marker._py + 8 };
      // 振り向く字が出ている時だけ、その実寸も足す。名と距離のほか、札の上にある金の矢印も空ける。
      const behindLabel = marker.querySelector('.behind-label');
      const turn = behindLabel && behindLabel.offsetParent && behindLabel.getBoundingClientRect();
      if (turn) { box.left = Math.min(box.left, turn.left - 8); box.right = Math.max(box.right, turn.right + 8); box.top = Math.min(box.top, turn.top - 32); box.bottom = Math.max(box.bottom, turn.bottom + 8); }
      placed.push(box);
    }
    for (let n = 0; n < sources.length && n < room; n++) {
      const u = sources[n], ranged = !u.sidearm && (u.type === 'bow' || u.type === 'gun') && (u.atk?.bow || u.atk?.ranged || Math.hypot(u.pos.x - p.pos.x, u.pos.z - p.pos.z) > 4);
      const el = this.threatEls[n];
      if (u.attackWarnAt == null || rt.t - (u.attackWarnLast ?? -99) > 8) u.attackWarnAt = rt.t;
      u.attackWarnLast = rt.t;
      const a = Math.atan2(u.pos.x - p.pos.x, u.pos.z - p.pos.z) - viewYaw;
      const direction = Math.cos(a) > 0.5 ? '前' : Math.cos(a) < -0.5 ? '後ろ' : Math.sin(a) > 0 ? '左' : '右';
      const danger = ranged ? u.type === 'bow' ? '矢' : '鉄砲' : '敵の槍・刀';
      const arrow = !rt.def.nearThreatWarning ? '▲' : direction === '前' ? '↑' : direction === '後ろ' ? '↓' : direction === '左' ? '←' : '→';
      setText(el, rt.def.compactThreats
        ? `${arrow} ${direction}から${ranged ? danger : '敵'}。${ranged && u.type === 'gun' ? rt.def.compactGunAction || '柵の陰へ' : rt.def.compactThreatAction?.(rt, u) || ''}`
        : rt.def.actionableThreats
        ? `${arrow} ${direction}から${danger}。${ranged && u.type === 'gun' ? '柵の陰へ退け' : ''}`
        : `▲ ${direction}・${danger}`);
      // 縁の合図でも危険の意味は読み上げ用に残す。判定と予告の時刻は変えない。
      el.setAttribute('aria-label', el.textContent);
      if (rt.def.quietCombatCues) setText(el, direction === '前' ? '↑' : direction === '後ろ' ? '↓' : direction === '左' ? '←' : '→');
      el.hidden = false;
    }
    // 三枚の文を書いてから実寸をまとめて読む。札ごとに書く・測るを往復しない。
    //   文・形・置き場・画面が前と同じ札は測り直さない（測るたびに画面の組み直しが起きて重い）
    for (let n = 0; n < count; n++) {
      const el = this.threatEls[n], size = this.threatSizes[n];
      const key = el.textContent + '|' + el.className + '|' + el.style.left + '|' + el.style.top + '|' + W + '|' + H;
      if (size.key === key) continue;
      const r = el.getBoundingClientRect();
      size.width = r.width; size.height = r.height; size.key = key;
    }
    if (count) this.hudRects();
    for (let n = 0; n < count; n++) {
      const u = sources[n], el = this.threatEls[n], size = this.threatSizes[n];
      const a = Math.atan2(u.pos.x - p.pos.x, u.pos.z - p.pos.z) - viewYaw;
      const h = size.height, hw = size.width / 2 + 8;
      if (rt.def.quietCombatCues) {
        // 前後は上下の端、左右は横の端へ。兵の頭と槍先が集まる中央を空ける。
        const front = Math.cos(a), side = Math.sin(a);
        setStyle(el, 'left', `${front > 0.5 || front < -0.5 ? W * 0.5 - side * W * 0.22 : side > 0 ? 28 : W - 28}px`);
        setStyle(el, 'top', `${front > 0.5 ? 100 : front < -0.5 ? H - 110 : H * 0.5}px`);
        continue;
      }
      const xy = this.avoidRects(W * 0.5 - Math.sin(a) * Math.min(W * 0.35, 340), H * 0.5 - Math.cos(a) * Math.min(H * 0.29, 200) + h / 2, W, H, 'h', placed, hw, h + 8, true);
      if (!xy) { el.hidden = true; continue; }
      setStyle(el, 'left', `${xy[0]}px`);
      setStyle(el, 'top', `${xy[1] - h / 2}px`);
      // 中心から半幅・半高を引いた実寸。置いた直後の再測定を省く。
      size.left = xy[0] - size.width / 2; size.right = xy[0] + size.width / 2;
      size.top = xy[1] - h; size.bottom = xy[1]; placed.push(size);
    }
  }
}
