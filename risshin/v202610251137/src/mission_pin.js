// 行き先は旗。画面外では端の方向矢印に同じ旗を添える。
//   戦の定義の missionPin(rt) が { x, z, r } を返す間だけ立てる（r＝着いたとみなす半径。定義の判定と同じ値を返す）。
//   待つ場所は着いても残す。印と投影用の点は一つを使い回す。
import * as THREE from 'three';
import { VIEW } from './viewport.js';
import { currentObjective, missionWaitReached, missionFollowTarget } from './mission_guide.js';
import { groundAt } from './floors.js';
import { cameraWallBlocked, inouSignVisible, inouSignHeight } from './battle_sight.js';
import { weatherSight, weatherSees } from './weather_gameplay.js';

// 任務札と話し相手の頭上で同じ吹き出しを使う。
export const TALK_SIGN = '<path d="M14 5H66V43H43L27 59V43H14Z" fill="#fff3ba" stroke="#14120f" stroke-width="5" stroke-linejoin="round"/><path d="M25 18H55M25 29H48" stroke="#14120f" stroke-width="4"/>';
let pin = null;
function make() {
  const el = document.createElement('div');
  el.id = 'mission-goal';
  el.innerHTML = '<svg width="80" height="80" viewBox="0 0 80 80" aria-hidden="true"><g class="goal-ground" stroke-linejoin="round"><ellipse cx="40" cy="68" rx="30" ry="9" fill="none" stroke="#14120f" stroke-width="10"/><ellipse cx="40" cy="68" rx="30" ry="9" fill="none" stroke="#fff3ba" stroke-width="5"/><path d="M32 8H48V37H61L40 59L19 37H32Z" fill="#fff3ba" stroke="#14120f" stroke-width="4"/></g><path class="goal-edge" d="M12 31H43V17L69 40L43 63V49H12Z" fill="#fff3ba" stroke="#14120f" stroke-width="4" stroke-linejoin="round" style="display:none;transform-origin:40px 40px"/></svg>';
  el.style.cssText = 'position:absolute;left:0;top:0;width:80px;height:80px;pointer-events:none;z-index:3';
  const style = document.createElement('style');
  style.textContent = '#hud.photo :is(#mission-goal,#mission-flag-frame,#mission-target-lines),#hud.ending :is(#mission-goal,#mission-flag-frame,#mission-target-lines),#hud:has(#bigmap:not([hidden])) :is(#mission-goal,#mission-flag-frame,#mission-target-lines),#hud:has(#cine.on) :is(#mission-goal,#mission-flag-frame,#mission-target-lines){display:none}' +
    '#hud.field-clean:has(#mission-goal.fire-action:not([hidden])) #prompt{display:none!important}' +
    '#mission-goal .goal-label{touch-action:none;user-select:none;box-sizing:border-box}' +
    '#mission-goal.fire-action .goal-label:focus-visible{outline:3px solid #fff;outline-offset:3px}' +
    '#mission-goal .fire-progress{position:absolute;bottom:4px;left:8px;right:8px;height:5px;background:#615745}' +
    '#mission-goal .fire-progress i{display:block;height:100%;background:#fff3ba;width:var(--fire-progress,0%)}';
  el.appendChild(style);
  const label = document.createElement('button');
  label.type = 'button'; label.className = 'goal-label'; label.tabIndex = -1;
  label.style.cssText = 'position:absolute;top:72px;left:50%;transform:translateX(-50%);white-space:nowrap;background:#14120f;color:#fff3ba;border:0;border-radius:4px;padding:4px 8px;font:bold max(22px, calc(22px * var(--text-scale, 1))) sans-serif;line-height:1.4;pointer-events:none';
  el.appendChild(label); el._label = label;
  const words = document.createElement('span'); label.appendChild(words); el._words = words;
  const guardSign = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  guardSign.setAttribute('viewBox', '0 0 80 64'); guardSign.setAttribute('aria-hidden', 'true');
  guardSign.style.cssText = 'display:none;width:30px;height:30px;vertical-align:middle;margin-right:4px';
  guardSign.innerHTML = '<path d="M22 7H58V30Q58 45 40 55Q22 45 22 30ZM40 15V41M29 26H51" fill="#fff3ba" stroke="#14120f" stroke-width="4"/>';
  label.prepend(guardSign); el._guardSign = guardSign;
  const progress = document.createElement('span'); progress.className = 'fire-progress';
  progress.setAttribute('role', 'progressbar'); progress.setAttribute('aria-label', '火付けの進み具合');
  progress.setAttribute('aria-valuemin', '0'); progress.setAttribute('aria-valuemax', '100');
  progress.innerHTML = '<i></i>'; label.appendChild(progress); el._workProgress = progress;
  const release = () => {
    if (el._hud && el._hud.workHoldId === el._work) el._hud.workHoldId = null;
  };
  label.addEventListener('pointerdown', event => {
    if (event.button !== 0 || !el._work) return;
    event.preventDefault(); event.stopPropagation();
    const rt = el._rt, it = rt?.nearestInteract();
    if (!rt || rt.over || rt.game.paused || !rt.player.u.alive || it?.id !== el._work) return;
    if (it.hold) el._hud.workHoldId = it.id;
    label.setPointerCapture(event.pointerId);
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture', 'blur']) label.addEventListener(type, release);
  label.addEventListener('keydown', event => {
    if (!el._work || !el._workHold || !['Enter', ' '].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation();
    const rt = el._rt;
    if (!rt.over && !rt.game.paused && rt.player.u.alive && rt.nearestInteract()?.id === el._work) el._hud.workHoldId = el._work;
  });
  label.addEventListener('keyup', event => { if (el._workHold && ['Enter', ' '].includes(event.key)) { event.preventDefault(); event.stopPropagation(); release(); } });
  label.addEventListener('click', event => {
    event.preventDefault(); event.stopPropagation();
    const rt = el._rt;
    if (el._work && !el._workHold && rt && !rt.over && !rt.game.paused && rt.player.u.alive &&
        rt.nearestInteract()?.id === el._work) rt.interact();
  });
  window.addEventListener('blur', release);
  document.addEventListener('visibilitychange', () => { if (document.hidden) release(); });
  const fire = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  fire.setAttribute('d', 'M40 4C46 22 65 28 61 45C59 60 44 66 32 59C15 50 20 36 29 25C27 36 34 38 36 31C40 22 36 14 40 4Z');
  fire.setAttribute('fill', '#fff3ba'); fire.setAttribute('stroke', '#14120f'); fire.setAttribute('stroke-width', '4');
  el.querySelector('svg').appendChild(fire); el._fire = fire;
  el._rings = el.querySelectorAll('.goal-ground ellipse');
  // 任務札から対象へ引く線と、守る実物の縁。画面全体で一組だけ使い回す。
  const lines = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  lines.id = 'mission-target-lines'; lines.setAttribute('aria-hidden', 'true');
  lines.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:2';
  lines.innerHTML = '<g fill="none" stroke-linejoin="round" stroke-linecap="round"><path class="target-outline" stroke="#14120f" stroke-width="10"/><path class="target-outline" stroke="#fff3ba" stroke-width="5"/><path class="target-link" stroke="#14120f" stroke-width="6"/><path class="target-link" stroke="#fff3ba" stroke-width="3"/></g>';
  el._lines = lines;
  el._outlines = lines.querySelectorAll('.target-outline');
  el._links = lines.querySelectorAll('.target-link');
  const flag = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  flag.setAttribute('d', 'M32 65V5H65L56 18L65 31H32');
  flag.setAttribute('fill', '#fff3ba'); flag.setAttribute('stroke', '#14120f');
  flag.setAttribute('stroke-width', '4'); flag.setAttribute('stroke-linejoin', 'round');
  flag.setAttribute('class', 'goal-flag');
  el.querySelector('svg').appendChild(flag);
  const person = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  person.innerHTML = '<g fill="#fff3ba" stroke="#14120f" stroke-width="6" stroke-linejoin="round"><circle cx="40" cy="12" r="9"/><path d="M25 42V32Q25 24 40 24Q55 24 55 32V42Z"/><path d="M35 48H45V55H53L40 68L27 55H35Z"/></g>';
  el.querySelector('svg').appendChild(person); el._person = person;
  el._personShape = person.innerHTML;
  const shield = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  shield.setAttribute('d', 'M22 7H58V30Q58 45 40 55Q22 45 22 30ZM40 15V41M29 26H51');
  shield.setAttribute('fill', '#fff3ba'); shield.setAttribute('stroke', '#14120f'); shield.setAttribute('stroke-width', '4');
  el.querySelector('svg').appendChild(shield); el._shield = shield;
  const treatment = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  treatment.innerHTML = '<rect x="20" y="5" width="40" height="40" rx="4" fill="#fff3ba" stroke="#14120f" stroke-width="4"/><path d="M40 13V37M28 25H52" stroke="#14120f" stroke-width="6"/>';
  el.querySelector('svg').appendChild(treatment); el._treatment = treatment;
  // 到着は完了ではない。待つ間は砂時計を残し、次の任務で印を切り替える。
  // 形は初回だけ作り、待ち時間の更新では属性だけ替える。
  const hold = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  hold.innerHTML = '<circle cx="40" cy="28" r="22" fill="#14120f" stroke="#fff3ba" stroke-width="3"/><path class="goal-progress" fill="#e8c25a"/><path d="M30 14H50V20L40 28L50 36V42H30V36L40 28L30 20ZM28 14H52M28 42H52" fill="none" stroke="#14120f" stroke-width="9" stroke-linejoin="round"/><path d="M30 14H50V20L40 28L50 36V42H30V36L40 28L30 20ZM28 14H52M28 42H52" fill="none" stroke="#fff3ba" stroke-width="4" stroke-linejoin="round"/>';
  hold.style.display = 'none';
  el.querySelector('svg').appendChild(hold);
  el._hold = hold; el._progress = hold.querySelector('.goal-progress');
  // 桶狭間の待機は同じピンの穴が満ちる様子で示す。
  const arrival = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  arrival.setAttribute('d', 'M40 10A18 18 0 1 1 40 46A18 18 0 1 1 40 10');
  arrival.setAttribute('fill', 'none'); arrival.setAttribute('stroke', '#e4f2cb');
  arrival.setAttribute('stroke-width', '3'); arrival.setAttribute('stroke-linecap', 'round');
  arrival.setAttribute('stroke-linejoin', 'round'); arrival.style.display = 'none';
  arrival.setAttribute('pathLength', '1');
  hold.appendChild(arrival); el._arrival = arrival;
  // 秒の字を足さず、穴の目盛り一つを一秒にする。形は最初に作って使い回す。
  const ticks = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  ticks.setAttribute('fill', 'none'); ticks.setAttribute('stroke', '#fff3ba');
  ticks.setAttribute('stroke-width', '1.5'); ticks.style.display = 'none';
  hold.appendChild(ticks); el._waitTicks = ticks;
  const hand = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  // 空の穴でも満ちた扇形でも針を読めるよう、明暗の二本を使い回す。
  hand.innerHTML = '<path d="M40 28V15" stroke="#14120f" stroke-width="5"/><path d="M40 28V15" stroke="#fff3ba" stroke-width="2"/>';
  hand.style.display = 'none';
  hold.appendChild(hand); el._waitHand = hand;
  // 到着はピンの軸のチェックで示す。穴の扇形は待ち時間だけを表す。
  const arrivedMark = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  arrivedMark.innerHTML = '<path d="M29 28L37 36L51 20" fill="none" stroke="#14120f" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/><path d="M29 28L37 36L51 20" fill="none" stroke="#fff3ba" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>';
  arrivedMark.style.display = 'none'; hold.appendChild(arrivedMark); el._arrivedMark = arrivedMark;
  const area = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  area.setAttribute('fill', 'none'); area.setAttribute('stroke', '#fff3ba');
  area.setAttribute('stroke-width', '5'); area.setAttribute('stroke-linejoin', 'round');
  area.style.filter = 'drop-shadow(0 0 2px #14120f)';
  area.style.display = 'none';
  const areaBack = area.cloneNode();
  areaBack.setAttribute('stroke', '#14120f'); areaBack.setAttribute('stroke-width', '10');
  el.querySelector('svg').prepend(areaBack, area); el._area = area; el._areaBack = areaBack;
  el._areaPoints = Array.from({ length: 16 }, () => new THREE.Vector3());
  const follow = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  follow.setAttribute('d', 'M40 2L58 24L40 46L22 24Z');
  follow.setAttribute('fill', '#fff3ba'); follow.setAttribute('stroke', '#14120f'); follow.setAttribute('stroke-width', '5');
  el.querySelector('svg').appendChild(follow); el._follow = follow;
  const gate = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  gate.setAttribute('d', 'M13 20H67V31H60V68H49V31H31V68H20V31H13ZM8 10H72V20H8Z');
  gate.setAttribute('fill', '#fff3ba'); gate.setAttribute('stroke', '#14120f');
  gate.setAttribute('stroke-width', '4'); gate.setAttribute('stroke-linejoin', 'round');
  el.querySelector('svg').appendChild(gate); el._gate = gate;
  const targetBadge = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  targetBadge.setAttribute('fill', '#fff3ba'); targetBadge.setAttribute('stroke', '#14120f');
  targetBadge.setAttribute('stroke-width', '3');
  lines.appendChild(targetBadge); el._targetBadge = targetBadge;
  el.querySelector('svg').style.overflow = 'visible';
  return el;
}

// 町・道場を除く全戦で、共通のピン一本で案内する。
export const pinGuideOn = (rt) => !!rt && !rt.def.town && !rt.def.dojo;

const tmp = { x: 0, z: 0, r: 6 };
export function missionTarget(rt) { return target(rt); }
function target(rt) {
  if (rt.def.missionPin) return rt.def.missionPin(rt);
  const follow = missionFollowTarget(rt);
  if (follow) {
    tmp.unit = follow; tmp.x = follow.pos.x; tmp.z = follow.pos.z;
    tmp.follow = true; tmp.fire = false; tmp.gate = false; tmp.defend = false; tmp.footRing = false;
    tmp.treatment = false;
    tmp.waiting = false; tmp.arrived = false; tmp.area = false; tmp.r = 0;
    tmp.y = undefined; tmp.doorFrame = null; tmp.turn = false; tmp.passage = false;
    return tmp;
  }
  // 定義の無い戦は、任務の手引きが選んだ行き先（今の任務と同じ印・同じ半径）へ立てる。
  const g = rt.missionGuide, m = g?.marker;
  if (!m || !g.objective || g.objective.id === '_wait' || g.objective !== currentObjective(rt)) return null;
  const person = typeof m.guidePerson === 'function' ? m.guidePerson() : m.guidePerson;
  if (m.guidePerson && (!person?.alive || person.gone)) return null;
  tmp.unit = person || null;
  tmp.follow = false;
  tmp.fire = m.guideSymbol === 'fire';
  tmp.gate = m.guideSymbol === 'gate';
  tmp.treatment = !!(m.treatment || m.guideArea === 'retreat' && /手当|布/.test(typeof m.label === 'function' ? m.label() : m.label || '')) &&
    rt.player.treatmentLeft > 0 && rt.player.treatmentNext <= rt.t;
  tmp.defend = m.guideDefend || m.guideArea === 'guard';
  tmp.defensePoint = m.guideDefensePoint;
  tmp.footRing = !!person && person.team === rt.player.u.team;
  // 火付けの到着点も、実際に作業できる戸口の足場にそろえる。
  const destination = m.guideDestination?.() || g.pos;
  // 最終地点へ直進させず、戦が選んだ通れる戸口・曲がり角を共通のピンでも使う。
  const route = (!person || person.team === rt.player.u.team) && !tmp.fire && rt.def.routeGuidePriority?.(rt)
    ? rt.def.routeSignPoint?.(rt, destination) : null;
  const pos = route || destination;
  // 人へ向かう下知でも、まず通れる口を示す。壁の裏の人へ直進させない。
  if (route) { tmp.unit = null; tmp.footRing = false; tmp.defend = false; tmp.defensePoint = null; }
  tmp.x = tmp.unit ? person.pos.x : pos.x; tmp.z = tmp.unit ? person.pos.z : pos.z;
  tmp.y = route?.y;
  tmp.doorFrame = route?.door ? route.frame : null;
  tmp.passage = !!route;
  const reached = missionWaitReached(rt);
  tmp.waiting = reached !== null && !person;
  tmp.arrived = tmp.waiting && reached;
  tmp.area = false;
  tmp.turn = !!route && !!rt.def.routeTurnReady?.(rt, route);
  tmp.dirX = route?.dirX; tmp.dirZ = route?.dirZ;
  // 戸口や曲がり角は六歩手前で印を消さず、すぐそばまで案内する。
  tmp.r = route ? .5 : rt.def.defendGuideRadius?.(rt, m) ?? m.guideRadius ?? (tmp.waiting ? 8 : m.entrance || m.id === 'next' ? 1 : 6);
  return tmp;
}

// 戦が指定した相手を優先し、移動中に別の敵へ札を付けない。
export function markedEnemy(rt) {
  if (!pinGuideOn(rt)) return null;
  const chosen = rt.def.commanderTarget?.(rt) || rt.def.missionSignTarget?.(rt);
  const goal = !rt.def.missionSignTarget ? target(rt) : null;
  const u = chosen || (goal?.enemy ? goal.unit : null);
  return u?.alive && u.team !== rt.player.u.team && !u.gone && !u.dying &&
    !u.downed && !u.woundOut && !u.rearWound && !u.fleeing ? u : null;
}

export function updateMissionPin(rt) {
  drawMissionPin(rt);
  // 稲生：行き先の印は常に一つ。地面のピン（画面外なら端の向き）が出ている間は、別の敵を指す端の▼を出さない（テストプレイの声 10/24）。
  //   ピンが敵を指す時は、頭上の大きな▼も同じ相手の時だけ残す（別々の所を指さない）。
  if (rt.def.key === 'inou' && pin && !pin.hidden && enemyTarget && !enemyTarget.hidden &&
      (enemyTarget._direction.style.display !== 'none' || (pinAt.unit && pinAt.unit !== rt.army.missionMarkedEnemy))) {
    enemyTarget.hidden = true; rt.hud.missionEnemyShown = false;
  }
}
function drawMissionPin(rt) {
  // 行き先の矢印は一本。画面外では方向と名前を同じ印に添える。
  updatePlayerFoot(rt);
  const destination = pinGuideOn(rt) ? target(rt) : null;
  const navMe = rt.player?.u?.pos;
  // 移動中は行き先、到着後は敵。同時に別の場所を指さない。
  const moving = destination && navMe && !destination.enemy && (!destination.unit || destination.unit.team === rt.player.u.team) &&
    Math.hypot(destination.x - navMe.x, destination.z - navMe.z) > (destination.r ?? 6);
  const taskFirst = destination && (destination.fire || destination.treatment || destination.dodge ||
    destination.unit?.team === rt.player.u.team);
  const enemyMarked = updateEnemyTarget(rt, !moving && !taskFirst);
  rt.hud.missionPinLabelShown = false;
  rt.hud.missionPinOutside = false;
  rt.hud.missionFlagFrame = null;
  if (pin) pin._lines.style.display = 'none';
  // 森部は描画面のピン一本で示す。旗と到着のチェックを同じ場所へ重ねない。
  if (rt.def.key === 'moribe') { if (pin) pin.hidden = true; return; }
  const want = pinGuideOn(rt) && !rt.over && !rt.choice && !rt.hud.introWaiting && rt.player?.u?.alive ? target(rt) : null;
  const closeEnemy = rt.missionGuide?.closeEnemy;
  const inouEnemy = rt.def.key === 'inou' && want?.unit && want.unit.team !== rt.player.u.team;
  // 本人が画面に見えている間は頭上の▼だけにする。
  // 足元のピンが札を避けて画面端へ回り、別方向へ誘うのを防ぐ。
  if (inouEnemy && inouSignVisible(rt, want.unit)) {
    const enemy = want.unit;
    goalPoint.set(enemy.pos.x, enemy.pos.y + (enemy.mounted ? 3.05 : (enemy.bodyHeight || 1.72) + .47), enemy.pos.z).project(rt.camera);
    if (goalPoint.z >= -1 && goalPoint.z <= 1 && Math.abs(goalPoint.x) < .9 && Math.abs(goalPoint.y) < .9) {
      if (pin) pin.hidden = true;
      return;
    }
  }
  // 次に攻撃する時は頭上の▼（画面外では向きの矢印）に一本化する。
  if (enemyMarked) {
    if (pin) pin.hidden = true;
    return;
  }
  // 稲生の敵本人は頭上の赤い▼。届く足場へ向かう間だけ、地面の行き先ピンを残す。
  if (inouEnemy && (enemyMarked || !want.approach)) {
    if (pin) pin.hidden = true;
    return;
  }
  // 倒す相手の札がある時は移動の印を重ねない。側面への命令は地面の矢印を優先する。
  if (!want || enemyMarked && !(inouEnemy && want.approach) && (want.enemy || want.unit?.team !== undefined && want.unit.team !== rt.player.u.team) || !want.always && !want.arrow && !inouEnemy && !rt.def.routeGuidePriority?.(rt) && !want.area && !want.waiting && !want.fire && !want.gate && !want.footRing && !want.defend && closeEnemy?.alive && !closeEnemy.gone && !closeEnemy.fleeing &&
      Math.hypot(closeEnemy.pos.x - rt.player.u.pos.x, closeEnemy.pos.z - rt.player.u.pos.z) < 4.5 && !rt.holdPct) {
    if (pin) { if (pin._hud && pin._hud.workHoldId === pin._work) pin._hud.workHoldId = null; pin.hidden = true; }
    return;
  }
  if (!pin) pin = make();
  const simplePin = rt.def.key === 'inou' || rt.def.key !== 'okehazama' && !want.unit && !want.area && !want.waiting && !want.fire && !want.gate && !want.footRing && !want.defend && !want.treatment && !want.passage && !want.marker?.waitAction && !want.marker?.waitGuide && !rt.missionGuide?.marker?.waitAction && !rt.missionGuide?.marker?.waitGuide;
  pin.querySelector('svg').style.display = simplePin ? 'none' : '';
  if (pin._simplePin) pin._simplePin.style.display = simplePin ? '' : 'none';
  const hud = rt.hud, root = hud.root;
  if (pin.parentNode !== root) root.appendChild(pin);
  if (pin._lines.parentNode !== root) root.appendChild(pin._lines);
  // 行き先が群れの真ん中だと毎コマ少しずつ動き、印が震える（kaito 10/23「グラグラ揺れる」）。
  //   遠くへ跳んだ時だけすぐ移し、ふだんは一メートル足らずの揺れを無視して、ゆっくり追わせる。地面の高さも同じ点で取る。
  const now = performance.now(), U = pinAt;
  const dt = Math.min(0.1, Math.max(0, (now - (U.at || now)) / 1000)); U.at = now;
  const me = rt.player.u.pos, key = want.key ?? rt.missionGuide?.key;
  const changed = U.rt !== rt || U.key !== key || U.unit !== want.unit;
  if (changed || Math.hypot(want.x - U.x, want.z - U.z) > 15) {
    U.x = want.x; U.z = want.z; U.rt = rt; U.key = key; U.unit = want.unit;
    U.y = groundAt(rt.world, U.x, U.z, me.y); U.ox = 0; U.oy = 0;
    U.out = undefined; U.outAt = 0; pin.hidden = false;
  }
  else if (Math.hypot(want.x - U.x, want.z - U.z) > 0.8) {
    const k = 1 - Math.exp(-dt * 1.5);
    U.x += (want.x - U.x) * k; U.z += (want.z - U.z) * k;
    U.y += (groundAt(rt.world, U.x, U.z, me.y) - U.y) * k;
  }
  // 稲生と到着範囲のあるピンは判定地点と一致させ、古い場所へ誘わない。
  if (rt.def.key === 'inou' || rt.def.key === 'okehazama' || rt.def.key === 'moribe' || want.approach || want.unit || want.area || want.waiting || want.fire || want.gate || rt.def.routeGuidePriority?.(rt)) {
    U.x = want.x; U.z = want.z; U.y = want.y ?? groundAt(rt.world, U.x, U.z, me.y);
  }
  const d = Math.hypot(want.x - me.x, want.z - me.z);
  const near = want.arrow || want.fire || want.gate || want.footRing || want.turn || want.doorFrame ? -2 : want.hide ?? (want.r ?? 6);
  const marker = want.marker || rt.missionGuide?.marker;
  const talk = !!want.unit && !!marker?.guideTalk;
  if (pin._talk !== talk) {
    pin._talk = talk; pin._person.innerHTML = talk ? TALK_SIGN : pin._personShape;
  }
  const waiting = want.treatment || (want.waiting ?? (!want.unit && !!marker && (marker.waitAction || marker.waitGuide || /^(wait|guard)$/.test(marker.guideArea))));
  const arrived = want.treatment ? d <= (want.r ?? 3) : waiting ? (want.arrived ?? missionWaitReached(rt)) === true : !!want.arrived;
  // 同じ集合地点へ着いた瞬間を記録し、地面の囲みを一拍だけ残す。
  if (changed || U.arrived !== arrived) { U.arrivalAt = arrived ? rt.t : undefined; U.arrived = arrived; }
  // 着いた・離れたの境で毎コマ出たり消えたりしない（チカチカ。kaito 10/23 稲生 27）。消えた後は一歩半離れてから出す。
  // 近接戦では頭上の▼に任せ、自分の体に行き先のピンを重ねない。
  // 敵へのピンは本人の足元。距離だけで消さず、実際に攻撃が届けば頭上の▼へ任せる。
  pin.hidden = inouEnemy
    ? rt.player.inRange && rt.player.rangeCueTarget === want.unit
    : !want.always && !waiting && d <= near + (pin.hidden ? 1.5 : 0);
  if (pin.hidden) return;
  const W = VIEW.w, H = VIEW.h;
  const rects = hud.hudRects();
  let enemyVisible = false;
  if (inouEnemy && inouSignVisible(rt, want.unit)) {
    const u = want.unit;
    // 実際の▼と同じ頭上を投影する。任務に重なっても地面へ別の案内を出さない。
    const head = u.mounted ? inouSignHeight(u) : Math.max(inouSignHeight(u), (u.bodyHeight || 1.72) + .47);
    goalPoint.set(u.pos.x, u.pos.y + head, u.pos.z).project(rt.camera);
    const sx = (goalPoint.x + 1) * W / 2, sy = (1 - goalPoint.y) * H / 2;
    // 遠くの小さな▼や任務に隠れた▼だけでピンを消さない。
    enemyVisible = d <= 40 && goalPoint.z >= -1 && goalPoint.z <= 1 &&
      sx >= 24 && sx <= W - 24 && sy >= 32 && sy <= H - 24 &&
      !rects.some(r => sx + 20 >= r.left && sx - 20 <= r.right && sy >= r.top && sy - 32 <= r.bottom);
  }
  // 同じ本人の▼が見えたらピンを畳む。別々の目印で別の兵へ誘わない。
  if (enemyVisible) { pin.hidden = true; return; }
  // 案内役は頭上の人型と下矢印、自分は足元の輪。離れても同じ形で追えるようにする。
  const groundPerson = rt.def.key === 'okehazama' && want.unit && (want.footRing || want.follow);
  // 集合ピンは到着の前後とも同じ地面へ固定する。自分の印に見える追従をしない。
  // 判定の範囲へ入った瞬間に色と穴の進みに替え、中心まで歩かせない。
  if (rt.def.key === 'okehazama' && want.area) goalPoint.set(want.x, groundAt(rt.world, want.x, want.z, me.y) + .08, want.z);
  else if (inouEnemy) goalPoint.set(want.x, groundAt(rt.world, want.x, want.z, me.y) + .08, want.z);
  else if (groundPerson) goalPoint.set(U.x, U.y + .08, U.z);
  else if (want.unit) goalPoint.set(want.unit.pos.x, want.unit.pos.y + (want.unit.mounted ? 3.3 : 2.1), want.unit.pos.z);
  // 火付けは柱の上でなく、実際に立てる足場へ印を置く。
  else if (want.fire) goalPoint.set(U.x, U.y + .08, U.z);
  else if (want.defend && want.defensePoint) {
    const post = want.defensePoint;
    goalPoint.set(post.x, groundAt(rt.world, post.x, post.z, me.y) + 1.65, post.z);
  } else goalPoint.set(U.x, U.y + .08, U.z);
  // 柱・襖の向こうへ旗を貼らず、同じ行き先の方向矢印へ切り替える。
  const cp = rt.camera.position;
  if (changed || now >= (U.sightAt || 0) || Math.hypot(cp.x - U.cx, cp.y - U.cy, cp.z - U.cz) > .4) {
    U.sightAt = now + 200; U.cx = cp.x; U.cy = cp.y; U.cz = cp.z;
    U.occluded = cameraWallBlocked(rt, cp, goalPoint);
  }
  const occluded = U.occluded;
  goalPoint.project(rt.camera);
  if (!Number.isFinite(goalPoint.x) || !Number.isFinite(goalPoint.y)) { pin.hidden = true; return; }
  const behind = goalPoint.z < -1 || goalPoint.z > 1;
  let dx = goalPoint.x * (behind ? -1 : 1), dy = -goalPoint.y * (behind ? -1 : 1);
  let x = (dx + 1) * W / 2, y = (dy + 1) * H / 2;
  // 移動先は地面の足形。側面へ回る時だけ太い地面の矢印に替える。
  if (simplePin) {
    drawGroundDestination(rt, pin, want, x, y, behind || occluded, rects);
    return;
  }
  // 足元を別の場所へずらさず、札に隠れる時も端の矢印へ切り替える。
  //   画面の端・札の縁でも、前のコマと同じ形を少しの間は保つ（地面の旗と端の矢印が入れ替わり続けない）。
  // 人と戸口の印は実物へ固定する。札避けで別の人や空き地へ動かさない。
  const inFrame = x >= 32 && x <= W - 32 && y >= (rt.def.key === 'okehazama' ? 104 : 76) && y <= H - (want.fire ? 68 : 24);
  // 本人や入口の位置をずらさず、札に隠れる時は端の方向案内へ替える。
  const covered = rects.some(r => x + 28 >= r.left && x - 28 <= r.right && y + (want.fire ? 60 : 4) >= r.top && y - 68 <= r.bottom);
  // 火付けの足場が画面内なら、その地面を示し続ける。軒や柱との重なりで上端へ飛ばさない。
  const anchored = !!(rt.def.key === 'okehazama' || want.unit || want.fire || want.gate || want.passage || want.defensePoint || want.area || waiting);
  let outside = behind || occluded && !want.fire || (anchored
    ? !inFrame || rt.def.key !== 'okehazama' && (covered || inouEnemy && !goalFree(x, y, W, H, rects))
    : !goalFree(x, y, W, H, rects));
  // 到着時は同じ地面で色を替え、一拍後は待つ円を任務の下へ一本だけ置く。
  // 画面外や札の下へ隠れた時はすぐ移し、移動の矢印を付けない。
  const dockedWait = rt.def.key === 'okehazama' && waiting && arrived && (outside || covered || rt.t - U.arrivalAt >= .8);
  if (dockedWait) {
    x = W - 52; y = Math.min(H - 80, 210); outside = false;
  }
  if (!want.unit && !want.gate && !waiting && !want.footRing && !want.fire && !want.defensePoint && !behind && !occluded && U.out !== undefined && outside !== U.out && now - (U.outAt || 0) < 400) outside = U.out;
  else if (outside !== U.out) { U.out = outside; U.outAt = now; }
  if (outside) {
    // 足元の投影は画面の下に出る。進む方向は地面上の向きから求め、前の目標へ下向きの矢印を出さない。
    rt.camera.getWorldDirection(goalDirection);
    const yaw = Math.atan2(goalDirection.x, goalDirection.z);
    const directionTarget = want.defend && want.defensePoint || want;
    const gx = directionTarget.x - me.x, gz = directionTarget.z - me.z;
    dx = -gx * Math.cos(yaw) + gz * Math.sin(yaw);
    dy = -(gx * Math.sin(yaw) + gz * Math.cos(yaw));
    const scale = Math.min((W / 2 - 60) / Math.max(Math.abs(dx), .001), (H / 2 - 80) / Math.max(Math.abs(dy), .001));
    // 画面外の目標は、その方向の端で同じ形と矢印を見せる。
    x = W / 2 + dx * scale;
    y = H / 2 + dy * scale;
  }
  // 画面外の印は同じ側の端に保ち、札を端に沿って避ける。
  // 頭上や床の印は実物からずらさない。
  if (!outside) { U.ox = 0; U.oy = 0; }
  else {
    const side = Math.abs(dx) / Math.max(.001, W / 2 - 96) >= Math.abs(dy) / Math.max(.001, H / 2 - 80);
    x = side ? dx >= 0 ? W - 96 : 96 : Math.max(96, Math.min(W - 96, x));
    y = side ? Math.max(80, Math.min(H - 68, y)) : dy >= 0 ? H - 68 : 80;
    const baseX = x, baseY = y;
    let found = goalFree(x, y, W, H, rects);
    for (let k = 1; k <= 40 && !found; k++) {
      const offset = Math.ceil(k / 2) * 18 * (k % 2 ? 1 : -1);
      const sx = baseX + (side ? 0 : offset), sy = baseY + (side ? offset : 0);
      if (goalFree(sx, sy, W, H, rects)) { x = sx; y = sy; found = true; }
    }
    if (!found) { pin.hidden = true; return; }
    U.ox = 0; U.oy = 0;
  }
  pin.hidden = false;
  pin.querySelector('.goal-ground').style.display = outside ? 'none' : '';
  const person = !!want.unit;
  const enemy = !inouEnemy && !!want.enemy;
  if (pin._enemy !== enemy) {
    pin._enemy = enemy;
    for (const part of pin.querySelectorAll('.goal-ground path,.goal-edge,.goal-flag')) part.setAttribute('fill', enemy ? '#ff634d' : '#fff3ba');
  }
  // 人・火付け・旗の目当ては、地面へ固定した小さな二重の輪で示す。
  // 持ち場の判定半径は変えず、足元だけを示す指定では大きな囲みを重ねない。
  const footMark = !want.unit && (want.passage || want.fire || marker?.guideFootRing || marker?.guideFlag || marker?.guideFlagMesh);
  const waitArea = waiting && !person && !want.treatment && !want.fire && !want.passage && !want.marker?.waitAction && !want.marker?.waitGuide && !rt.missionGuide?.marker?.waitAction && !rt.missionGuide?.marker?.waitGuide;
  // 集合地点は旗の小さな足元印より、実際の到着範囲を優先する。
  // 出発前・行軍中・合図待ちで根元の大きさを変えない。
  const areaRadius = want.area ? want.r : waitArea ? want.r ?? 8 : footMark ? want.fire ? 1.25 : .85 : want.r;
  // 地面に刺すピンは一本。固定の大きな輪ではなく、実際に着いたとみなす地面の範囲を囲む。
  // 桶狭間は近づいた時だけ、ピンの根元を実際の集合範囲まで広げる。
  // 到着した瞬間は同じ囲みを緑と閉じた縁で示し、一拍置いて畳む。
  // 囲みは自分を追わず、畳んだ後は同じピンのチェックと穴の満ち具合で示す。
  const showArea = rt.def.key === 'okehazama'
    ? want.area && !dockedWait && (!arrived || rt.t - U.arrivalAt < .8) && d <= 18 && !outside && !occluded
    : false;
  pin._area.style.display = pin._areaBack.style.display = showArea ? '' : 'none';
  pin._area.setAttribute('stroke-width', want.passage ? '7' : '5');
  pin._area.setAttribute('stroke-dasharray', '');
  if (showArea) {
    pin._area.setAttribute('stroke', arrived ? '#e4f2cb' : '#fff3ba');
    if (pin._areaRt !== rt || pin._areaX !== want.x || pin._areaZ !== want.z || pin._areaR !== areaRadius) {
      pin._areaRt = rt; pin._areaX = want.x; pin._areaZ = want.z; pin._areaR = areaRadius;
      for (let i = 0; i < pin._areaPoints.length; i++) {
        const a = i * Math.PI * 2 / pin._areaPoints.length;
        const ax = want.x + Math.cos(a) * areaRadius, az = want.z + Math.sin(a) * areaRadius;
        pin._areaPoints[i].set(ax, groundAt(rt.world, ax, az, me.y) + .08, az);
      }
    }
    // 判定と同じ外周を投影し、中心を踏まず範囲へ入ればよいと示す。
    let path = '';
    let areaComplete = true;
    for (let ring = 0; ring < (waitArea && rt.def.key !== 'okehazama' ? 2 : 1); ring++) {
      let connected = false, complete = true;
      for (let i = 0; i <= pin._areaPoints.length; i++) {
        areaPoint.copy(pin._areaPoints[i % pin._areaPoints.length]);
        if (ring) {
          areaPoint.x = want.x + (areaPoint.x - want.x) * .88;
          areaPoint.z = want.z + (areaPoint.z - want.z) * .88;
        }
        areaPoint.project(rt.camera);
        if (areaPoint.z < -1 || areaPoint.z > 1) { connected = false; complete = false; continue; }
        path += `${connected ? 'L' : 'M'}${((areaPoint.x + 1) * W / 2 - x + 40).toFixed(1)} ${((1 - areaPoint.y) * H / 2 - y + (outside ? 40 : 68)).toFixed(1)}`;
        connected = true;
      }
      if (complete) path += 'Z';
      else areaComplete = false;
    }
    pin._area.setAttribute('d', path);
    pin._areaBack.setAttribute('d', path);
    // 輪の内側全体が集合範囲。視点の後ろへ欠けた外周は閉じて塗らない。
    pin._area.setAttribute('fill', rt.def.key === 'okehazama' && areaComplete ? arrived ? '#e4f2cb' : '#fff3ba' : 'none');
    pin._area.setAttribute('fill-opacity', '.12');
  }
  // 桶狭間はピンの先端を到着判定の地面に刺す。兵の頭上を指す矢印に替えない。
  const flagDestination = !person && !enemy && !want.fire && !want.gate && !want.dodge && (!want.turn || want.passage) && !want.defensePoint && !want.treatment;
  // 通る入口にも矢印を残し、人・敵・守る対象の印とは重ねない。
  const destinationArrow = rt.def.key !== 'okehazama' && (flagDestination || want.gate) && !arrived && !outside && !want.follow && !want.enemy && !want.defend;
  // 小旗の横に短い矢印を置き、同じ行き先の足場だけを指す。
  pin.querySelector('.goal-ground path').setAttribute('d', 'M35 40H45V53H52L40 68L28 53H35Z');
  pin.querySelector('.goal-ground path').style.display = destinationArrow ? '' : 'none';
  const flag = pin.querySelector('.goal-flag');
  // 桶狭間は地面に刺さる一点を示す。固定の小さな輪を到着範囲に見せない。
  const oke = rt.def.key === 'okehazama';
  if (!oke) for (const ring of pin._rings) {
    ring.removeAttribute('transform');
    ring.style.display = 'none';
  }
  // 到着は色も替える。歩いている間は穴を満たさず、待つ時計と混ぜない。
  if (oke) {
    const fill = arrived ? '#e4f2cb' : '#fff3ba';
    if (flag.getAttribute('fill') !== fill) flag.setAttribute('fill', fill);
  }
  // 集合地点のピンを保ち、普通の行き先は旗の形で区別する。
  const groundPin = oke || inouEnemy || flagDestination;
  // 普通の行き先は切れ込みのある旗。画面内外で同じ形を保つ。
  if (pin._groundPin !== groundPin || pin._wideHole !== oke || pin._flagDestination !== flagDestination || pin._passage !== want.passage || pin._outsideFlag !== outside || pin._waitArrived !== arrived || pin._waitWaiting !== waiting) {
    pin._outsideFlag = outside;
    pin._waitArrived = arrived;
    pin._waitWaiting = waiting;
    pin._groundPin = groundPin; pin._wideHole = oke; pin._flagDestination = flagDestination; pin._passage = want.passage;
    flag.setAttribute('d', groundPin && (oke || !flagDestination) ? oke
      // 到着しても穴の位置を保ち、同じ丸の中で待つ進みを示す。
      ? arrived && waiting
        // 到着後は同じ丸の時計だけ。地面へ刺す軸を畳み、再び向かう場所に見せない。
        ? 'M40 -2A30 30 0 1 1 40 58A30 30 0 1 1 40 -2Z M40 8A20 20 0 1 0 40 48A20 20 0 1 0 40 8Z'
        : 'M40 68L34 58V57.4A30 30 0 1 1 46 57.4V58Z M40 8A20 20 0 1 0 40 48A20 20 0 1 0 40 8Z'
      : 'M40 68L25 38C5 9 75 9 55 38Z M40 20A6 6 0 1 0 40 32A6 6 0 1 0 40 20Z' : 'M32 65V5H65L56 18L65 31H32');
    flag.setAttribute('fill-rule', 'evenodd');
  }
  // 合図の時刻は範囲を出ても進む。同じピンの円も途切れさせない。
  const showProgress = oke && Number.isFinite(want.progress);
  // 接近中は空の穴。輪へ入ってから縁を閉じ、待つ進みを示す。
  // 丸が満ちる意味は待ち時間だけ。接近中に別の円弧を満たさない。
  const showArrival = oke && arrived;
  const showHold = oke ? showProgress || showArrival : arrived && (!person || want.footRing) && !want.defend && !outside && !flagDestination;
  flag.style.display = destinationArrow || (person && !groundPerson) || want.defend || inouEnemy || want.fire || want.gate || want.dodge || showHold && !oke ? 'none' : '';
  if (flagDestination && !oke) flag.style.display = '';
  if (flagDestination) pin.querySelector('.goal-ground path').style.display = 'none';
  // 通る床には旗を立て、短い下向き矢印の先を同じ輪の中心へ合わせる。
  if (want.passage && !outside) {
    flag.setAttribute('d', 'M32 65V5H65L56 18L65 31H32');
    pin.querySelector('.goal-ground path').style.display = '';
  }
  // 赤い▼は兵の頭上だけ。見失った時は同じ相手の足元へ金のピン一本を置く。
  if (inouEnemy) flag.style.display = '';
  const friendlyPerson = person && !oke && !enemy && (want.follow || want.footRing);
  pin._person.style.display = person && !destinationArrow && !groundPerson && !enemy && !showHold ? '' : 'none';
  if (inouEnemy) pin._person.style.display = 'none';
  pin._follow.style.display = 'none'; // 案内役は敵のひし形と区別できる人型にそろえる。
  pin._follow.setAttribute('transform', outside ? 'translate(10,-24) scale(.75)' : 'translate(14,38) scale(.65)');
  pin._gate.style.display = want.gate && !destinationArrow ? '' : 'none';
  pin._gate.setAttribute('transform', outside ? 'translate(10,-24) scale(.75)' : '');
  pin._person.setAttribute('transform', outside ? 'translate(0,-38)' : '');
  pin._shield.style.display = want.defend && !flagDestination ? '' : 'none';
  pin._shield.setAttribute('transform', outside ? 'translate(10,-24) scale(.75)' : '');
  // 盾の下端を実物の上辺に合わせる。空き地への下向き矢印は重ねない。
  if (want.defend && want.defensePoint && !outside) pin._shield.setAttribute('transform', 'translate(0,13)');
  pin._hold.style.display = showHold ? '' : 'none';
  // 到着の一拍は穴いっぱいのチェック。その後、同じ穴で待ち時間を満たす。
  // 軸の小さな印を探させず、未到着と到着を形で区別する。
  const arrivalCue = oke && arrived && (rt.t - U.arrivalAt < .8 || want.progress >= 1);
  pin._arrivedMark.style.display = arrivalCue ? '' : 'none';
  pin._arrivedMark.setAttribute('transform', '');
  pin._arrival.style.display = showArrival ? '' : 'none';
  pin._arrival.setAttribute('stroke', arrived ? '#e4f2cb' : '#fff3ba');
  // 集合した時だけ穴の縁が閉じ、中の扇形が待ち時間を刻む。
  // 別の丸へ替えず、同じ地面に刺さるピンの中だけで示す。
  const arrivalProgress = arrived ? 1 : 0;
  // 作成時の一周を１とする指定に合わせ、縁の進みを正規化する。
  pin._arrival.setAttribute('stroke-dasharray', '1');
  pin._arrival.setAttribute('stroke-dashoffset', String(1 - arrivalProgress));
  // 桶狭間は到着しても同じピンを残し、その穴の中だけで待ちの進みを示す。
  // 別の時計へ替えず、待つ場所と満ち切る合図を一つにする。
  if (pin._holdOke !== oke) {
    pin._holdOke = oke;
    pin._hold.children[2].style.display = oke ? 'none' : '';
    pin._hold.children[3].style.display = oke ? 'none' : '';
    pin._hold.children[0].setAttribute('stroke', oke ? 'none' : '#fff3ba');
    pin._progress.setAttribute('fill', oke ? '#fff3ba' : '#e8c25a');
    pin._progress.setAttribute('stroke', 'none');
    pin._progress.setAttribute('stroke-width', '0');
    // 到着の内周と、満ちていく扇形だけで待つ進みを示す。
    pin._arrival.style.filter = 'drop-shadow(0 0 2px #14120f)';
  }
  if (oke) pin._hold.children[0].setAttribute('stroke', arrived ? '#fff3ba' : 'none');
  if (!arrived && !showProgress) pin._progress.setAttribute('d', '');
  if (arrived || showProgress) {
    const progress = Number.isFinite(want.progress) ? Math.max(0, Math.min(1, want.progress)) : 0;
    // 進み具合が不明でも砂時計を出し、完了を思わせる印にはしない。
    // 満ち切る直前まで扇形。完了は円にして合図の時刻とそろえる。
    const angle = Math.PI * 2 * Math.min(progress, .9999);
    pin._progress.setAttribute('d', progress >= 1
      ? 'M40 8A20 20 0 1 1 40 48A20 20 0 1 1 40 8'
      : progress > 0 ? `M40 28L40 8A20 20 0 ${progress > .5 ? 1 : 0} 1 ${40 + Math.sin(angle) * 20} ${28 - Math.cos(angle) * 20}Z` : '');
  }
  pin._progress.style.display = arrivalCue ? 'none' : '';
  const clock = oke && arrived && showProgress && !arrivalCue;
  pin._waitTicks.style.display = pin._waitHand.style.display = clock ? '' : 'none';
  if (clock) {
    const duration = want.waitDuration || 17;
    if (pin._tickDuration !== duration) {
      pin._tickDuration = duration;
      let path = '';
      for (let i = 0; i < duration; i++) {
        const angle = i * Math.PI * 2 / duration;
        const sx = Math.sin(angle), sy = -Math.cos(angle);
        path += `M${40 + sx * 16} ${28 + sy * 16}L${40 + sx * 19} ${28 + sy * 19}`;
      }
      pin._waitTicks.setAttribute('d', path);
    }
    pin._waitHand.setAttribute('transform', `rotate(${Math.min(1, Math.max(0, want.progress)) * 360} 40 28)`);
  }
  // 端では同じ旗を矢印の上へ置き、見えている時は目的の人や床に竿を合わせる。
  const edgeFlag = outside && !person && !oke && !arrived && !enemy && !want.fire && !want.gate && !want.dodge && !want.treatment;
  if (edgeFlag) {
    flag.style.display = '';
    flag.setAttribute('d', 'M32 65V5H65L56 18L65 31H32');
    pin._person.style.display = 'none';
    pin._gate.style.display = 'none';
  }
  if (!oke) flag.setAttribute('transform', outside ? edgeFlag ? 'translate(14,-34) scale(.65)' :
    groundPin ? 'translate(0,-24) scale(.75)' : 'translate(0,-24)' : groundPin ? '' : 'translate(16,19.25) scale(.75)');
  // 到着しても穴を動かさず、別の行き先に切り替わったように見せない。
  if (!oke) pin._hold.setAttribute('transform', '');
  // 待機中は同じ一本だけを拡大し、携帯でも残る扇形と針を読めるようにする。
  pin.firstElementChild.style.transformOrigin = '40px 68px';
  pin.firstElementChild.style.transform = oke && clock ? 'scale(1.35)' : '';
  // 方向は端の旗一本へまとめ、自分の足元には輪だけを残す。
  // 行き先の輪は足さず、自分の水色の足元印と役割を分ける。
  const groundRing = false;
  if (pin._groundRing !== groundRing) {
    pin._groundRing = groundRing;
    for (const ring of pin._rings) ring.style.display = groundRing ? '' : 'none';
  }
  const arrow = pin.querySelector('.goal-edge');
  const turn = want.turn && !outside && !want.passage && !want.marker?.waitAction && !want.marker?.waitGuide && !rt.missionGuide?.marker?.waitAction && !rt.missionGuide?.marker?.waitGuide;
  // 人型・炎・門は端の矢印と組み合わせ、地面のピンは一本で方向を示す。
  arrow.style.display = (edgeFlag || !groundPin && !inouEnemy) && !arrived && (outside || turn && !person) ? '' : 'none';
  if (edgeFlag) pin._shield.style.display = 'none';
  if (arrived && outside) { if (!oke) flag.style.display = 'none'; pin._shield.style.display = 'none'; }
  pin._treatment.style.display = want.treatment ? '' : 'none';
  pin._treatment.setAttribute('transform', outside ? 'translate(10,-20) scale(.75)' : 'translate(0,14)');
  if (want.treatment) { flag.style.display = 'none'; pin._hold.style.display = 'none'; }
  if (turn) {
    rt.camera.getWorldDirection(goalDirection);
    const yaw = Math.atan2(goalDirection.x, goalDirection.z);
    dx = -want.dirX * Math.cos(yaw) + want.dirZ * Math.sin(yaw);
    dy = -(want.dirX * Math.sin(yaw) + want.dirZ * Math.cos(yaw));
    flag.style.display = 'none';
  }
  arrow.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
  // 画面外も同じピンの先端で示す。大きな矢印とピンを二つ並べない。
  if (groundPin && outside && !edgeFlag && !oke) {
    if (want.passage) flag.setAttribute('d', 'M10 29H43V12L72 40L43 68V51H10Z');
    flag.setAttribute('transform', `translate(40,40) rotate(${Math.atan2(dy, dx) * 180 / Math.PI - 90}) ${oke ? 'scale(.8) translate(-40,-8)' : 'translate(-40,-40)'}`);
    pin._hold.setAttribute('transform', `${flag.getAttribute('transform')} ${oke ? 'translate(4,-17.2) scale(.9)' : 'translate(22,13.4) scale(.45)'}`);
  }
  // 旗の形を回さず、向きは添えた矢印で示す。
  if (want.passage && !outside) flag.setAttribute('transform', 'translate(-22,0)');
  // 到着後は先端を畳み、集合で見たピンの穴で待ち時間を示す。
  if (oke) {
    if (arrived) flag.style.display = '';
    // 細い軸を地面まで伸ばし、兵本人に付く印と区別する。
    // 到着後は先端を畳み、任務の下の丸が満ちる間は別の行き先に見せない。
    const shape = arrived
      ? 'M40 -22A30 30 0 1 1 40 38A30 30 0 1 1 40 -22Z M40 -12A20 20 0 1 0 40 28A20 20 0 1 0 40 -12Z'
      : 'M40 68L34 58V37A30 30 0 1 1 46 37V58Z M40 -12A20 20 0 1 0 40 28A20 20 0 1 0 40 -12Z';
    if ((!outside || arrived) && flag.getAttribute('d') !== shape) flag.setAttribute('d', shape);
    flag.setAttribute('fill', arrived ? '#e4f2cb' : '#fff3ba');
    flag.setAttribute('stroke', '#14120f');
    // 到着の前後で位置も大きさも変えず、待つ間は画面の端でも向きを回さない。
    // 最終位置だけを一度決め、表示したままのピンを毎コマ別の位置へ書き換えない。
    const transform = !outside ? 'translate(6,10.2) scale(.85)' : arrived ? 'translate(0,-24) scale(.75)' :
      `translate(40,40) rotate(${Math.atan2(dy, dx) * 180 / Math.PI - 90}) scale(.8) translate(-40,-8)`;
    const holdTransform = `${transform} translate(4,-17.2) scale(.9)`;
    if (flag.getAttribute('transform') !== transform) flag.setAttribute('transform', transform);
    if (pin._hold.getAttribute('transform') !== holdTransform) pin._hold.setAttribute('transform', holdTransform);
    // 集合範囲は実寸の囲みだけで示し、固定の小さな輪は重ねない。
    // 到着後も輪を出さず、画面端の丸を次の集合場所に見せない。
    for (const ring of pin._rings) {
      ring.style.display = 'none';
    }
    if (waiting && arrived) {
      flag.style.display = 'none';
      pin._hold.setAttribute('transform', 'translate(0,40)');
      pin._hold.children[0].setAttribute('stroke', '#e4f2cb');
      // 集合した印は丸が満ち切った時にだけ出す。途中の扇形を覆わない。
      pin._arrivedMark.style.display = want.progress >= 1 ? '' : 'none';
      pin._arrivedMark.removeAttribute('transform');
    }
  }
  hud.missionPinOutside = outside;
  if (friendlyPerson && !outside) {
    pin._person.style.display = '';
    pin._hold.style.display = 'none';
  }
  pin._fire.style.display = want.fire ? '' : 'none';
  if (want.fire && !outside) pin.querySelector('.goal-ground path').style.display = '';
  if (flagDestination && !oke && !outside) {
    flag.setAttribute('d', 'M32 65V5H65L56 18L65 31H32');
    flag.setAttribute('transform', 'translate(-6,-5)');
    pin.querySelector('.goal-ground path').style.display = '';
  }
  // 炎の下端を輪より上へ離し、立つ足場を隠さない。
  pin._fire.setAttribute('transform', outside ? 'translate(8,-32) scale(.8)' : 'translate(8,4) scale(.8)');
  const action = want.fire ? rt.nearestInteract() : null;
  const working = !!action && /火/.test(action.label) && action.id === marker?.id;
  const label = pin._label;
  label.style.top = '72px'; label.style.left = '50%';
  pin._guardSign.style.display = 'none';
  // 距離と守備の案内は右上の任務札へまとめ、ここは押せる火付けだけ。
  // 稲生は字のないピン一本。相手は同じ本人の頭上の赤い▼で示す。
  const text = rt.def.key !== 'inou' && working ? action.hold ? '火をつける（長押し）' : '火をつける' : '';
  if (pin._words.textContent !== text) pin._words.textContent = text;
  pin.classList.toggle('fire-action', working);
  const progress = working && rt.holdId === action.id ? Math.round(Math.max(0, Math.min(1, rt.holdPct || 0)) * 100) : 0;
  pin._workProgress.hidden = !working || !action.hold;
  if (pin._workProgress.getAttribute('aria-valuenow') !== String(progress)) {
    pin._workProgress.setAttribute('aria-valuenow', progress);
    label.style.setProperty('--fire-progress', `${progress}%`);
  }
  label.hidden = !text;
  // 短い案内を端で切らず、同じ印の幅の中へ収める。
  label.style.maxWidth = '220px'; label.style.whiteSpace = 'normal';
  label.style.left = `${40 + Math.max(116 - x, Math.min(W - 116 - x, 0))}px`;
  // 人名は本人の頭より上。札を避けて別人の上へ動かさない。
  label.style.top = outside ? '72px' : friendlyPerson ? '-44px' : '88px';
  if (friendlyPerson && !outside) label.style.left = '40px';
  // 火付け釦は画面内の同じ場所へ置く。戸口が画面外でも押せる。
  if (working) {
    label.style.left = `${W / 2 - x + 40}px`;
    label.style.top = `${H - 80 - y + (outside ? 40 : 68)}px`;
  }
  // 盾は柵、札は立つ範囲へ。守る物と立つ場所を同じ点に重ねない。
  if (want.defend && showArea) {
    areaPoint.set(want.x, groundAt(rt.world, want.x, want.z, me.y) + .08, want.z).project(rt.camera);
    const ax = (areaPoint.x + 1) * W / 2, ay = (1 - areaPoint.y) * H / 2;
    if (areaPoint.z >= -1 && areaPoint.z <= 1 && goalFree(ax, ay, W, H, rects)) {
      label.style.left = `${ax - x + 40}px`;
      label.style.top = `${ay - y + (outside ? 40 : 68)}px`;
    }
  }
  label.style.pointerEvents = working ? 'auto' : 'none';
  label.style.minHeight = working ? '52px' : '0';
  label.style.width = working ? '208px' : 'max-content';
  label.style.border = working ? '2px solid #fff3ba' : '0';
  label.style.padding = working ? '8px 12px 14px' : '4px 8px';
  label.style.background = working ? '#29251c' : '#14120f';
  label.tabIndex = working ? 0 : -1;
  if (pin._work && pin._work !== (working ? action.id : null) && hud.workHoldId === pin._work) hud.workHoldId = null;
  // 待機の図形を長押しの真偽値で上書きしない。次の更新でも同じ図形を使う。
  pin._work = working ? action.id : null; pin._workHold = working && !!action.hold; pin._hud = hud; pin._rt = rt;
  hud.missionPinLabelShown = !!text;
  // 人を示す任務札から同じ足元へ一本だけつなぐ。札は増やさない。
  let linkPath = '', outlinePath = '';
  // 案内役は本人の頭上の人型で示し、体を横切る線を足さない。
  // 戸口は床のピンだけで示す。実寸の囲みは近づくと戦場全体を覆う。
  const order = hud.guideOrderRect;
  if (person && want.footRing && order && !friendlyPerson) {
    const tx = x, ty = outside ? y : y - 12;
    const lx = Math.max(order.left, Math.min(order.right, tx));
    const ly = Math.max(order.top, Math.min(order.bottom, ty));
    linkPath = `M${lx.toFixed(1)} ${ly.toFixed(1)}L${tx.toFixed(1)} ${ty.toFixed(1)}`;
  }
  // 対象の柵を実寸の太い二重縁で囲む。投影する点は使い回す。
  const fence = want.defend && marker?.guideDefenseOutline;
  if (fence && !outside) {
    for (let i = 0; i < 4; i++) {
      const post = fence[i === 0 || i === 3 ? 0 : 1];
      areaPoint.set(post.x, groundAt(rt.world, post.x, post.z, me.y) + (i < 2 ? 1.65 : .08), post.z).project(rt.camera);
      if (areaPoint.z < -1 || areaPoint.z > 1) { outlinePath = ''; break; }
      outlinePath += `${i ? 'L' : 'M'}${((areaPoint.x + 1) * W / 2).toFixed(1)} ${((1 - areaPoint.y) * H / 2).toFixed(1)}`;
    }
    if (outlinePath) outlinePath += 'Z';
  }
  // 人物の輪郭は共通の描画面で本人の手足に沿わせる。
  let badgePath = '';
  // 到着前後とも同じ実旗を囲む。兵に遮られても輪と縁は画面の手前に残す。
  const guardFlag = !oke && !person && !want.fire && !want.gate && !want.treatment && (marker?.guideFlag || marker?.guideFlagMesh || marker?.guideFlagFrame)
    ? hud.goalFlagBounds(rt, marker, want) : null;
  if (guardFlag) {
    const fullWidth = Math.max(64, guardFlag.width), fullHeight = Math.max(80, guardFlag.height);
    const rawLeft = guardFlag.left + (guardFlag.width - fullWidth) / 2;
    const rawTop = guardFlag.top + (guardFlag.height - fullHeight) / 2;
    // 旗が上端へ少し切れても、見えている布を囲み続ける。
    const fl = Math.max(8, rawLeft), ft = Math.max(8, rawTop);
    const fw = Math.min(W - 8, rawLeft + fullWidth) - fl;
    const fh = Math.min(H - 12, rawTop + fullHeight) - ft;
    if (fw >= 24 && fh >= 24) {
      outlinePath = `M${fl} ${ft}h${fw}v${fh}h${-fw}Z`;
      // ほかの隊旗と区別するひし形を、目指す実旗の上辺へ固定する。
      const bx = fl + fw / 2, by = Math.max(18, ft);
      badgePath = `M${bx} ${by - 14}l12 14l-12 14l-12 -14Z`;
      pin._shield.style.display = 'none';
      flag.style.display = 'none';
      hud.missionFlagFrame = guardFlag;
      hud.missionPinOutside = false;
      // 床が見切れていても、前方に見える実旗へ矢じりを向ける。
      // 別方向の移動矢印と歩数札は畳み、任務札一枚と旗の囲みにまとめる。
      arrow.style.display = 'none';
      pin.querySelector('.goal-ground path').style.display = 'none';
      label.hidden = true; hud.missionPinLabelShown = false;
      if (!arrived) {
        playerPoint.set(me.x, me.y + .1, me.z).project(rt.camera);
        const tx = fl + fw / 2, ty = ft + fh / 2;
        const px = (playerPoint.x + 1) * W / 2, py = (1 - playerPoint.y) * H / 2;
        const length = Math.hypot(tx - px, ty - py);
        if (playerPoint.z >= -1 && playerPoint.z <= 1 && length > 1) {
          const ux = (tx - px) / length, uy = (ty - py) / length;
          const edge = Math.min(fw / 2 / Math.max(.001, Math.abs(ux)), fh / 2 / Math.max(.001, Math.abs(uy))) + 8;
          const ax = tx - ux * edge, ay = ty - uy * edge;
          linkPath = `M${ax - ux * 40} ${ay - uy * 40}L${ax} ${ay}M${ax - ux * 12 - uy * 8} ${ay - uy * 12 + ux * 8}L${ax} ${ay}L${ax - ux * 12 + uy * 8} ${ay - uy * 12 - ux * 8}`;
        }
      }
    }
    // 布と同じ旗の足元に輪を固定する。本人の輪とは色と大きさを分ける。
    const foot = hud.goalFlagFoot || want;
    if (marker.guideFlagMesh && hud.goalFlag) hud.goalFlag.getWorldPosition(flagFootPoint);
    else flagFootPoint.set(foot.x, 0, foot.z);
    flagFootPoint.y = groundAt(rt.world, flagFootPoint.x, flagFootPoint.z, me.y) + .08;
    flagFootPoint.project(rt.camera);
    const fx = (flagFootPoint.x + 1) * W / 2, fy = (1 - flagFootPoint.y) * H / 2;
    if (!waitArea && flagFootPoint.z >= -1 && flagFootPoint.z <= 1 && fx >= 32 && fx <= W - 32 && fy >= 24 && fy <= H - 16) {
      outlinePath += `M${fx - 30} ${fy}a30 9 0 1 0 60 0a30 9 0 1 0 -60 0`;
      pin._area.style.display = pin._areaBack.style.display = 'none';
    }

  }
  pin._targetBadge.setAttribute('d', badgePath);
  for (const path of pin._links) path.setAttribute('d', linkPath);
  for (const path of pin._outlines) path.setAttribute('d', outlinePath);
  pin._lines.style.display = linkPath || outlinePath || badgePath ? '' : 'none';
  // 丸めず小数一桁で置き、地面に固定する。
  pin.style.transform = `translate(${(x - 40).toFixed(1)}px,${(y - (outside ? 40 : 68)).toFixed(1)}px)`;
}

// 目当ての一人は白ふちの▼。画面外でも同じ相手の方向を示す。
let enemyTarget = null;
function signEnemyAlive(enemy, me) {
  return enemy?.alive && enemy.team !== me.team && !enemy.gone && !enemy.dying &&
    !enemy.downed && !enemy.woundOut && !enemy.rearWound && !enemy.fleeing && !enemy.noTarget &&
    !enemy.isStruct && !enemy.civ && enemy.mesh?.visible !== false;
}
// 画面の外でも、霧と壁で隠れない相手なら同じ矢印で追う。
function signEnemySeen(rt, enemy, me) {
  return Math.hypot(enemy.pos.x - me.pos.x, enemy.pos.z - me.pos.z) <= Math.min(18, weatherSight(rt.world), rt.world.vis ?? 680) &&
    weatherSees(rt.world, me.pos, enemy.pos) &&
    !cameraWallBlocked(rt, me.pos, enemy.pos, me.pos.y + 1.6, enemy.pos.y + 1.6);
}
function updateEnemyTarget(rt, allowed = true) {
  const hud = rt.hud, me = rt.player?.u;
  hud.missionEnemyShown = false;
  hud.enemySignOffscreen = false;
  // 近い敵は頭上の▼と、画面外の同じ印で追う。
  const inou = rt.def.key === 'inou';
  const active = allowed && rt.def.key !== 'okehazama' && rt.def.key !== 'moribe' && pinGuideOn(rt) && me?.alive && !rt.over && !rt.choice && !hud.introWaiting &&
    !rt.player.camShot && !hud.bigmap && !hud.root.classList.contains('photo') &&
    !hud.root.classList.contains('ending') && !hud.root.querySelector('#cine.on');
  // 目前の一人を優先する。僅かな距離の差で印を付け替えず、見通しは四分の一秒ごとに調べる。
  if (inou || rt.def.key === 'okehazama') {
    // 稲生は描画の束にある本人の▼だけを使う。札で命中・間合いの変化を覆わない。
    hud.enemySignUnit = null;
    const fieldActive = pinGuideOn(rt) && me?.alive && !rt.over && !rt.choice && !hud.introWaiting &&
      !rt.player.camShot && !hud.bigmap && !hud.root.classList.contains('photo') &&
      !hud.root.classList.contains('ending') && !hud.root.querySelector('#cine.on');
    rt.army.missionMarkedEnemy = fieldActive ? markedEnemy(rt) : null;
    if (enemyTarget) enemyTarget.hidden = true;
    return false;
  }
  if (active && !inou && (hud.enemySignRt !== rt || hud.enemySignAt == null || rt.t >= hud.enemySignAt || rt.t < hud.enemySignAt - .25)) {
    if (hud.enemySignRt !== rt) hud.enemySignUnit = null;
    hud.enemySignRt = rt;
    hud.enemySignAt = rt.t + .25;
    let nearest = null, distance = 18;
    for (const enemy of rt.army.units) {
      if (!signEnemyAlive(enemy, me)) continue;
      const d = Math.hypot(enemy.pos.x - me.pos.x, enemy.pos.z - me.pos.z);
      if (d >= distance || !signEnemySeen(rt, enemy, me)) continue;
      nearest = enemy; distance = d;
    }
    const previous = hud.enemySignUnit;
    if (signEnemyAlive(previous, me) && Math.hypot(previous.pos.x - me.pos.x, previous.pos.z - me.pos.z) <= Math.min(18, distance + 2) &&
        signEnemySeen(rt, previous, me)) nearest = previous;
    const reachable = rt.player.inRange && rt.player.rangeCueTarget;
    const assigned = markedEnemy(rt);
    // 攻撃判定の相手を最優先。近くで戦っていなければ任務の相手を示す。
    hud.enemySignUnit = signEnemyAlive(reachable, me) && signEnemySeen(rt, reachable, me) ? reachable :
      distance > 7 && signEnemyAlive(assigned, me) && signEnemySeen(rt, assigned, me) ? assigned : nearest;
  }
  // 稲生は任務の林兵だけを指す。近くにいる別の隊の敵へ付け替えない。
  const candidate = hud.enemySignUnit;
  // 追いつくまで攻撃対象外の林兵にも、追うための印は残す。
  const assignedChase = active && inou && rt.flags.chase && candidate === markedEnemy(rt);
  const u = active && (signEnemyAlive(candidate, me) || assignedChase && candidate) ? candidate : null;
  // 兵の描画側も同じ一人への視線を空ける。戦や任務が変われば解除する。
  rt.army.missionMarkedEnemy = u;
  if (enemyTarget) enemyTarget.hidden = true;
  // 稲生は描画面の赤い▼と行き先のピンに統一する。別の札・方向の字・端の▼は重ねない。
  if (inou) return false;
  const commander = u && u === rt.def.commanderTarget?.(rt);
  // 稲生は上で頭上の▼にまとめ、ほかの戦も相手がいなければ札を出さない。
  if (!u) return false;
  if (!enemyTarget) {
    enemyTarget = document.createElement('div');
    enemyTarget.id = 'mission-enemy-target';
    enemyTarget.style.cssText = 'position:absolute;left:0;top:0;width:112px;text-align:center;pointer-events:none;z-index:4';
    enemyTarget.innerHTML = '<svg width="40" height="48" viewBox="0 0 56 64" aria-hidden="true" style="display:block;margin:auto"><path d="M7 27H49L28 55Z" fill="#a33124" stroke="#14120f" stroke-width="10" stroke-linejoin="round"/><path d="M7 27H49L28 55Z" fill="#a33124" stroke="#fff" stroke-width="5" stroke-linejoin="round"/></svg><svg width="48" height="48" viewBox="0 0 48 48" aria-hidden="true" style="position:absolute;left:60px;top:0"><path d="M8 19H25V10L40 24L25 38V29H8Z" fill="#fff3df" stroke="#14120f" stroke-width="4" stroke-linejoin="round"/></svg><b style="position:absolute;left:50%;top:48px;transform:translateX(-50%);white-space:nowrap;background:#14120f;color:#fff3df;padding:2px 6px;font:bold 18px/24px sans-serif"></b>';
    enemyTarget._symbol = enemyTarget.firstChild;
    enemyTarget._direction = enemyTarget.children[1];
    enemyTarget._caption = enemyTarget.lastChild;
    const health = document.createElement('span');
    health.style.cssText = 'position:absolute;left:28px;top:-34px;width:56px;height:6px;background:#14120f;border:1px solid #fff3df';
    health.setAttribute('role', 'meter');
    health.setAttribute('aria-label', '目標の体力');
    health.setAttribute('aria-valuemin', '0'); health.setAttribute('aria-valuemax', '100');
    health.innerHTML = '<i style="display:block;height:100%;background:#d9573b;transform-origin:left"></i>';
    enemyTarget.appendChild(health); enemyTarget._health = health;
    enemyTarget._healthFill = health.firstChild;
  }
  if (enemyTarget.parentNode !== hud.root) hud.root.appendChild(enemyTarget);
  const W = VIEW.w, H = VIEW.h, rects = hud.hudRects();
  const head = u.mounted ? 3.05 : Math.max(2.1, (u.bodyHeight || 1.72) + .35);
  goalPoint.set(u.pos.x, u.pos.y + head, u.pos.z).project(rt.camera);
  let x = (goalPoint.x + 1) * W / 2, y = (1 - goalPoint.y) * H / 2;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  // 印の先を頭上へ固定する。札を避けて別の兵の上へ動かさない。
  const halfWidth = inou ? 84 : 60;
  const visible = (!inou || inouSignVisible(rt, u)) && goalPoint.z >= -1 && goalPoint.z <= 1 && x >= halfWidth + 4 && x <= W - halfWidth - 4 && y >= (inou ? 96 : 80) && y <= H - 12 &&
    !cameraWallBlocked(rt, rt.camera.position, u.pos) &&
    !rects.some(r => x + halfWidth > r.left && x - halfWidth < r.right && y > r.top && y - 76 < r.bottom);
  const name = inou ? rt.def.missionEnemyLabel?.(rt) || 'はやしの兵' : '敵';
  const labelRoom = goalLabelRoom(hud);
  const steps = inou ? rt.def.missionEnemySteps(rt, u) : 0;
  const distanceText = steps ? `あと${steps}歩` : '間合い内';
  // 遠くでは距離を、槍の届く所では残る体力を示して命中を確かめられるようにする。
  const distance = Math.hypot(u.pos.x - me.pos.x, u.pos.z - me.pos.z);
  const close = inou && distance <= rt.player.meleeReach(rt.player.previewMeleeKind() || 'thrust');
  let caption = inou ? close
    ? `${name}・体力 ${Math.max(0, Math.ceil(u.hp))}／${Math.ceil(u.maxHp || 1)}`
    : `${name}・${distanceText}` : name;
  if (!visible) {
    rt.camera.getWorldDirection(goalDirection);
    const yaw = Math.atan2(goalDirection.x, goalDirection.z);
    const gx = u.pos.x - me.pos.x, gz = u.pos.z - me.pos.z;
    const right = -gx * Math.cos(yaw) + gz * Math.sin(yaw);
    const forward = gx * Math.sin(yaw) + gz * Math.cos(yaw);
    // 相手の背後ではなく、自分から見た方向と視点を回す操作を伝える。
    const direction = `自分の${Math.abs(right) > Math.abs(forward) * .35 ? right >= 0 ? '右' : '左' : ''}${forward < 0 ? '後ろ' : '前'}`;
    caption = inou ? `${name}・${distanceText}\n${direction}・${right >= 0 ? '右' : '左'}へ視点を回す` : '敵';
    // 稲生の端の矢印は視点を回す向き。後ろの敵へ前進を続けさせない。
    enemyTarget._direction.style.transform = `rotate(${inou ? right >= 0 ? 0 : Math.PI : Math.atan2(-forward, right)}rad)`;
    // 印・矢印・文を一組で収める。任務や体力と重ならない端の余白を探す。
    x = right >= 0 ? W - halfWidth - 8 : halfWidth + 8;
    const top = 64, bottom = H - 88;
    const preferred = Math.max(top, Math.min(bottom, H * (forward < 0 ? .6 : .4) - 48));
    let best = Infinity, found = false;
    for (let i = 0; i <= 16; i++) {
      const cy = i === 0 ? preferred : top + (bottom - top) * (i - 1) / 15;
      if (rects.some(r => x + halfWidth > r.left && x - halfWidth < r.right && cy + (inou ? 100 : labelRoom ? 76 : 48) > r.top && cy - 4 < r.bottom)) continue;
      const distance = Math.abs(cy - preferred);
      if (distance < best) { best = distance; y = cy + 48; found = true; }
    }
    if (!found) {
      if (!inou) return false;
      // 携帯横で札が多い時も消さず、上の人数帯の下に収める。
      x = W / 2; y = 100;
    }
  }
  // 画面端には矢印だけを出す。赤い三角は本人の頭上に限る。
  enemyTarget._symbol.style.display = visible ? '' : 'none';
  enemyTarget._symbol.style.transform = visible ? '' : 'translateX(-20px)';
  enemyTarget._direction.style.left = inou ? '32px' : '60px';
  enemyTarget._direction.style.display = visible ? 'none' : '';
  enemyTarget._symbol.setAttribute('width', commander ? '48' : '40');
  enemyTarget._caption.style.top = visible ? '-24px' : '48px';
  enemyTarget._caption.style.display = inou ? '' : 'none';
  // 初陣の目当て一人だけ。命の棒の減りで、突きが届いたことを見せる。
  enemyTarget._health.hidden = !inou || !visible;
  if (inou && visible) {
    const health = Math.round(Math.max(0, Math.min(1, u.hp / (u.maxHp || 1))) * 100);
    if (enemyTarget._healthValue !== health) {
      enemyTarget._healthValue = health;
      enemyTarget._healthFill.style.transform = `scaleX(${health / 100})`;
      enemyTarget._health.setAttribute('aria-valuenow', String(health));
    }
  }
  enemyTarget._caption.style.fontSize = inou ? '14px' : '18px';
  enemyTarget._caption.style.whiteSpace = inou ? 'pre' : 'nowrap';
  if (enemyTarget._caption.textContent !== caption) enemyTarget._caption.textContent = caption;
  enemyTarget.setAttribute('aria-label', visible ? name + 'をたおせ' : caption);
  enemyTarget.style.transform = `translate(${(x - 56).toFixed(1)}px,${(y - 48).toFixed(1)}px)`;
  enemyTarget.hidden = false;
  hud.missionEnemyShown = true;
  hud.enemySignOffscreen = inou && !visible;
  return true;
}

function goalLabelRoom(hud) {
  let cards = 1; // 体力の一枚。
  if (hud.missionEnemyShown) cards++;
  if (hud.prog && !hud.prog.hidden && hud.prog.offsetParent) cards++;
  for (const item of hud.notices.picks) {
    if (!item.el.hidden && item.el.offsetParent && getComputedStyle(item.el).visibility !== 'hidden') cards++;
  }
  return cards < 3;
}

function drawGroundDestination(rt, el, want, x, y, hidden, rects) {
  if (!el._simplePin) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '80'); svg.setAttribute('height', '80');
    svg.setAttribute('viewBox', '0 0 80 80'); svg.setAttribute('aria-hidden', 'true');
    svg.style.overflow = 'visible';
    svg.innerHTML = '<g class="ground-step" fill="none"><ellipse rx="29" ry="9" stroke="#14120f" stroke-width="9"/><ellipse rx="29" ry="9" stroke="#fff3ba" stroke-width="4"/></g><path class="ground-route" d="M-9-58H9V-28H23L0 0L-23-28H-9Z" fill="#fff3ba" stroke="#14120f" stroke-width="4" stroke-linejoin="round"/>';
    el.appendChild(svg); el._simplePin = svg;
  }
  const inou = rt.def.key === 'inou';
  el._label.hidden = true;
  el._label.style.top = '-90px';
  el._label.style.left = '0';
  el._work = null; el.classList.remove('fire-action');
  const W = VIEW.w, H = VIEW.h;
  const route = el._simplePin.querySelector('.ground-route'), step = el._simplePin.firstChild;
  // 森部・稲葉山などは先端が土に刺さるピン。稲生は穴のある丸いピンにする。
  const routeShape = inou
    ? 'M0 0C-5-11-18-26-18-39A18 18 0 1 1 18-39C18-26 5-11 0 0ZM0-47A8 8 0 1 0 0-31A8 8 0 1 0 0-47Z'
    : 'M0 0L-5-12V-35A17 17 0 1 1 5-35V-12Z M0-63A10 10 0 1 0 0-43A10 10 0 1 0 0-63Z';
  if (route.getAttribute('d') !== routeShape) {
    route.setAttribute('d', routeShape); route.setAttribute('fill-rule', 'evenodd');
  }
  const outside = hidden || x < 92 || x > W - 92 || y < 104 || y > H - 68 || !inouPinFree(x, y, rects);
  // 稲生は画面内も画面端も同じ穴のあるピン。横向きの操作矢印と取り違えさせない。
  route.style.display = '';
  // 敵へ向かうピンは小さくし、足元から胴や自分の頭まで覆わない。
  el._simplePin.style.transform = inou && want.approach && !outside ? 'scale(.55)' : '';
  el._simplePin.style.transformOrigin = '0 0';
  step.style.display = inou || outside ? 'none' : '';
  if (!el._routeEdge) {
    const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    arrow.setAttribute('d', 'M-15-5H3V-13L18 0L3 13V5H-15Z');
    arrow.setAttribute('fill', '#fff3ba'); arrow.setAttribute('stroke', '#14120f');
    arrow.setAttribute('stroke-width', '4'); arrow.setAttribute('stroke-linejoin', 'round');
    el._simplePin.appendChild(arrow); el._routeEdge = arrow;
  }
  el._routeEdge.style.display = outside && !inou ? '' : 'none';
  const caption = '';   // 行き先の字は出さない（ピンだけ。10/25 チカチカ）
  if (el._words.textContent !== caption) el._words.textContent = caption;
  let angle = 0;
  if (outside) {
    rt.camera.getWorldDirection(goalDirection);
    const yaw = Math.atan2(goalDirection.x, goalDirection.z), me = rt.player.u.pos;
    const gx = want.x - me.x, gz = want.z - me.z;
    const dx = -gx * Math.cos(yaw) + gz * Math.sin(yaw);
    const dy = -(gx * Math.sin(yaw) + gz * Math.cos(yaw));
    if (Math.hypot(dx, dy) < .001) { el.hidden = true; return; }
    angle = Math.atan2(dy, dx) * 180 / Math.PI - 90;
    // 札を避ける時は同じ画面端に沿って移し、体力を指す場所へ戻さない。
    const side = Math.abs(dx) / Math.max(1, W / 2 - 92) >= Math.abs(dy) / Math.max(1, H / 2 - 86);
    const baseX = side ? dx >= 0 ? W - 92 : 92 : W / 2;
    const baseY = side ? H / 2 : dy >= 0 ? H - 68 : 104;
    let found = false;
    for (let i = 0; i <= 40; i++) {
      const offset = Math.ceil(i / 2) * 18 * (i % 2 ? 1 : -1);
      x = baseX + (side ? 0 : offset); y = baseY + (side ? offset : 0);
      if (x < 92 || x > W - 92 || y < 104 || y > H - 68 || !inouPinFree(x, y, rects)) continue;
      found = true; break;
    }
    if (!found) { el.hidden = true; return; }
    el._routeEdge.setAttribute('transform', `translate(48,-32) rotate(${Math.atan2(dy, dx) * 180 / Math.PI})`);
  }
  // 行き先の形は回さず、端に添えた小さな矢印だけを回す。
  route.setAttribute('transform', '');
  rt.hud.missionPinLabelShown = !el._label.hidden;
  el.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`;
  el.hidden = false;
  rt.hud.missionPinOutside = outside;
}
function inouPinFree(x, y, rects) {
  const side = 80, bottom = 60;
  for (const r of rects) if (x + side > r.left && x - side < r.right && y + bottom > r.top && y - 100 < r.bottom) return false;
  return true;
}
// 自分の白い輪は画面の手前に描き、重なる兵や馬に隠さない。
let playerFoot = null;
function updatePlayerFoot(rt) {
  const active = rt.def.key !== 'inou' && rt.def.key !== 'okehazama' && rt.def.key !== 'moribe' && pinGuideOn(rt) && !rt.over && !rt.choice && !rt.hud.introWaiting &&
    rt.player?.u?.alive && !rt.player.camShot && !rt.hud.bigmap;
  if (!active) {
    if (playerFoot) playerFoot.hidden = true;
    return;
  }
  if (!playerFoot) {
    playerFoot = document.createElement('div');
    playerFoot.id = 'mission-player-foot';
    playerFoot.setAttribute('aria-hidden', 'true');
    playerFoot.style.cssText = 'position:absolute;width:48px;height:24px;pointer-events:none;z-index:4';
    playerFoot.innerHTML = '<svg width="48" height="24" viewBox="0 0 48 24"><ellipse cx="24" cy="12" rx="19" ry="7" fill="none" stroke="#14120f" stroke-width="8"/><ellipse cx="24" cy="12" rx="19" ry="7" fill="none" stroke="#ffffff" stroke-width="4"/></svg>';
  }
  if (playerFoot.parentNode !== rt.hud.root) rt.hud.root.appendChild(playerFoot);
  const u = rt.player.u, p = u.pos;
  const hidden = rt.hud.root.classList.contains('photo') || rt.hud.root.classList.contains('ending') ||
    !!rt.hud.root.querySelector('#cine.on');
  playerPoint.set(p.x, p.y + .1, p.z).project(rt.camera);
  const x = (playerPoint.x + 1) * VIEW.w / 2, y = (1 - playerPoint.y) * VIEW.h / 2;
  playerFoot.hidden = hidden || playerPoint.z < -1 || playerPoint.z > 1 ||
    x < 0 || x > VIEW.w || y < 0 || y > VIEW.h ||
    rt.hud.hudRects().some(r => x + 24 > r.left && x - 24 < r.right && y + 12 > r.top && y - 12 < r.bottom);
  if (playerFoot.hidden) return;
  playerFoot.style.transform = `translate(${(x - 24).toFixed(1)}px,${(y - 12).toFixed(1)}px)`;
}
const areaPoint = new THREE.Vector3();
const flagFootPoint = new THREE.Vector3();
const playerPoint = new THREE.Vector3();
const goalPoint = new THREE.Vector3();
const goalDirection = new THREE.Vector3();
const pinAt = { x: 0, z: 0, y: 0, ox: 0, oy: 0, at: 0, rt: null };
function goalFree(x, y, W, H, rects) {
  // 輪と旗は八十画素。実寸と余白だけを避け、携帯横でも案内を畳まない。
  if (x < 96 || x > W - 96 || y < 104 || y > H - 68) return false;
  for (const r of rects) if (x + 96 >= r.left && x - 96 <= r.right && y + 64 >= r.top && y - 76 <= r.bottom) return false;
  return true;
}
