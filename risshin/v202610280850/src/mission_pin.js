// 行き先は旗。画面外では端の方向矢印に同じ旗を添える。
//   戦の定義の missionPin(rt) が { x, z, r } を返す間だけ立てる（r＝着いたとみなす半径。定義の判定と同じ値を返す）。
//   待つ場所は着いても残す。印と投影用の点は一つを使い回す。
import * as THREE from 'three';
import { VIEW, safeInsets } from './viewport.js';
import { missionWaitReached } from './mission_guide.js';
import { groundAt } from './floors.js';
import { cameraWallBlocked, inouSignVisible, inouSignHeight } from './battle_sight.js';
import { pinGuideOn, missionTarget, markedEnemy, target, updateEnemyTarget, goalPoint, goalDirection } from './mission_pin_target.js';
export { pinGuideOn, missionTarget, markedEnemy };   // 前からの読み込み口（hud_cards・field_map・field_signs）はそのまま

// 任務札と話し相手の頭上で同じ下向きの矢印を使う。
export const TALK_SIGN = '<path d="M32 7H48V35H61L40 63L19 35H32Z" fill="#fff3ba" stroke="#14120f" stroke-width="6" stroke-linejoin="round"/>';
let pin = null;
// 一歩進む操作の合間にも、輪へ入った結果を見届けられる長さ。
const ARRIVAL_CUE_SECONDS = 2.4;
function make() {
  const el = document.createElement('div');
  el.id = 'mission-goal';
  el.innerHTML = '<svg width="80" height="80" viewBox="0 0 80 80" aria-hidden="true"><g class="goal-ground" stroke-linejoin="round"><ellipse cx="40" cy="68" rx="30" ry="9" fill="none" stroke="#14120f" stroke-width="10"/><ellipse cx="40" cy="68" rx="30" ry="9" fill="none" stroke="#fff3ba" stroke-width="5"/><path d="M32 8H48V37H61L40 59L19 37H32Z" fill="#fff3ba" stroke="#14120f" stroke-width="4"/></g><path class="goal-edge" d="M12 31H43V17L69 40L43 63V49H12Z" fill="#fff3ba" stroke="#14120f" stroke-width="4" stroke-linejoin="round" style="display:none;transform-origin:40px 40px"/></svg>';
  el.style.cssText = 'position:absolute;left:0;top:0;width:80px;height:80px;pointer-events:none;z-index:3';
  const style = document.createElement('style');
  style.textContent = '#hud.photo :is(#mission-goal,#mission-flag-frame,#mission-target-lines),#hud.ending :is(#mission-goal,#mission-flag-frame,#mission-target-lines),#hud:has(#bigmap:not([hidden])) :is(#mission-goal,#mission-flag-frame,#mission-target-lines),#hud:has(#cine.on) :is(#mission-goal:not(.cine-keep),#mission-flag-frame,#mission-target-lines){display:none}' +
    '#hud.field-clean:has(#mission-goal.fire-action:not([hidden])) #prompt{display:none!important}' +
    // 命・任務・操作の三枚に収め、押せる間は小地図と兵力の札を畳む。
    '#hud:has(#mission-goal:is(.fire-action,.talk-action):not([hidden])) :is(#armybar,#minimap,#maphint,.field-names){display:none!important}' +
    // 会話の操作札が出る間だけ右上の重複を畳む。
    '#hud:has(#mission-goal.talk-action:not([hidden])) #h-prog{display:none!important}' +
    '#mission-goal .goal-label{touch-action:none;user-select:none;box-sizing:border-box}' +
    '#mission-goal .goal-label:focus-visible{outline:3px solid #fff;outline-offset:3px}' +
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
  lines.innerHTML = '<g fill="none" stroke-linejoin="round" stroke-linecap="round"><path class="target-outline" stroke="#14120f" stroke-width="4.5" stroke-opacity=".75"/><path class="target-outline" stroke="#fff3ba" stroke-width="2.2" stroke-opacity=".85"/><path class="target-link" stroke="#14120f" stroke-width="6"/><path class="target-link" stroke="#fff3ba" stroke-width="3"/></g>';
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
  person.innerHTML = '<path d="M26 66V5H65L55 20L65 35H31V66Z" fill="#fff3ba" stroke="#14120f" stroke-width="5" stroke-linejoin="round"/>';
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
  // 守備のピンは、残る時間の輪の中で刃を交える形にする。待機の針とは分ける。
  const guard = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  guard.innerHTML = '<circle cx="40" cy="28" r="9" fill="#14120f"/><path d="M30 38L48 20M44 20H48V24M50 38L32 20M32 24V20H36M29 32L36 39M44 39L51 32" fill="none" stroke="#fff3ba" stroke-width="2.5" stroke-linejoin="round"/>';
  guard.lastElementChild.setAttribute('transform', 'translate(40 28) scale(.6) translate(-40 -28)');
  guard.style.display = 'none'; hold.appendChild(guard); el._guardClock = guard;
  // 到着はピンの軸のチェックで示す。穴の扇形は待ち時間だけを表す。
  const arrivedMark = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  arrivedMark.innerHTML = '<path d="M29 28L37 36L51 20" fill="none" stroke="#14120f" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/><path d="M29 28L37 36L51 20" fill="none" stroke="#fff3ba" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>';
  arrivedMark.style.display = 'none'; hold.appendChild(arrivedMark); el._arrivedMark = arrivedMark;
  const area = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  area.setAttribute('fill', 'none'); area.setAttribute('stroke', '#fff3ba');
  area.setAttribute('stroke-width', '2.2'); area.setAttribute('stroke-linejoin', 'round'); area.setAttribute('stroke-dasharray', '9 7'); area.setAttribute('stroke-opacity', '.8');   // 守る範囲は細い破線（10/28 太い白線が戦場を横切って見えた）
  area.style.filter = 'drop-shadow(0 0 2px #14120f)';
  area.style.display = 'none';
  const areaBack = area.cloneNode();
  areaBack.setAttribute('stroke', '#14120f'); areaBack.setAttribute('stroke-width', '4.5'); areaBack.setAttribute('stroke-opacity', '.45');
  el.querySelector('svg').prepend(areaBack, area); el._area = area; el._areaBack = areaBack;
  const areaFlags = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  areaFlags.setAttribute('fill', '#fff3ba'); areaFlags.setAttribute('stroke', '#14120f');
  areaFlags.setAttribute('stroke-width', '3'); areaFlags.setAttribute('stroke-linejoin', 'round');
  el.querySelector('svg').appendChild(areaFlags); el._areaFlags = areaFlags;
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

export function updateMissionPin(rt) {
  drawMissionPin(rt);
}
function drawMissionPin(rt) {
  // 行き先の矢印は一本。画面外では方向と名前を同じ印に添える。
  updatePlayerFoot(rt);
  const destination = pinGuideOn(rt) ? target(rt) : null;
  if (destination?.guardBoundary) drawJoinGround(rt, destination,
    !rt.over && !rt.choice && !rt.hud.introWaiting && rt.player.u.alive &&
    !rt.hud.root.classList.contains('photo') && !rt.hud.root.classList.contains('ending') &&
    !rt.hud.bigmap && !rt.player.camShot && !rt.hud.root.querySelector('#cine.on'));
  rt.hud.missionDefenseShown = !!destination?.defend;
  const navMe = rt.player?.u?.pos;
  // 移動中は行き先、到着後は敵。同時に別の場所を指さない。
  const moving = destination && navMe && !destination.enemy && (!destination.unit || destination.unit.team === rt.player.u.team) &&
    Math.hypot(destination.x - navMe.x, destination.z - navMe.z) > (destination.r ?? 6);
  const taskFirst = destination && (destination.guardBoundary || destination.defend || destination.fire || destination.treatment || destination.dodge ||
    destination.unit?.team === rt.player.u.team);
  // 森部は共通の頭上▼で間合い・命中まで示す。別の大きな▼と「敵」の札で覆わない。
  const enemyMarked = updateEnemyTarget(rt, rt.def.missionStyle !== 'ford' && (!moving || destination?.route) && !taskFirst);
  rt.hud.missionPinLabelShown = false;
  rt.hud.missionPinOutside = false;
  rt.hud.missionFlagFrame = null;
  if (pin) pin._lines.style.display = 'none';
  // 森部は描画面のピン一本で示す。旗と到着のチェックを同じ場所へ重ねない。
  if (rt.def.missionStyle === 'ford') { if (pin) pin.hidden = true; return; }
  const want = pinGuideOn(rt) && !rt.over && !rt.choice && !rt.hud.introWaiting && rt.player?.u?.alive ? target(rt) : null;
  const closeEnemy = rt.missionGuide?.closeEnemy;
  // 桶狭間も稲生と同じ：敵を指すピンは、本人の▼が画面に見えない間だけ。
  const inouEnemy = (rt.def.missionStyle === 'lesson' || rt.def.missionStyle === 'raid') && want?.unit && want.unit.team !== rt.player.u.team;
  // ▼の見え方は下の共通の高さ・画面端・任務との重なりで一度だけ判定する。
  // 稲生は頭上の▼を見失った時だけ、同じ本人へ既存の行き先ピンを出す。
  // 頭上へ戻った時は上の判定で畳み、別の兵へ印を重ねない。
  if (rt.def.missionStyle !== 'lesson' && rt.def.missionStyle !== 'raid' && (want?.enemy || (want?.unit && want.unit.team !== rt.player.u.team))) {
    if (pin) pin.hidden = true;
    return;
  }
  // 次に攻撃する時は頭上の▼（画面外では向きの矢印）に一本化する。
  if (enemyMarked && !want?.route) {
    if (pin) pin.hidden = true;
    return;
  }
  // 倒す相手の札がある時は移動の印を重ねない。側面への命令は地面の矢印を優先する。
  if (!want || enemyMarked && !(inouEnemy && want.approach) && (want.enemy || want.unit?.team !== undefined && want.unit.team !== rt.player.u.team) || !want.always && !want.arrow && !want.route && !inouEnemy && !rt.def.routeGuidePriority?.(rt) && !want.area && !want.waiting && !want.fire && !want.gate && !want.footRing && !want.defend && closeEnemy?.alive && !closeEnemy.gone && !closeEnemy.fleeing &&
      Math.hypot(closeEnemy.pos.x - rt.player.u.pos.x, closeEnemy.pos.z - rt.player.u.pos.z) < 4.5 && !rt.holdPct) {
    if (pin) { if (pin._hud && pin._hud.workHoldId === pin._work) pin._hud.workHoldId = null; pin.hidden = true; }
    return;
  }
  if (!pin) pin = make();
  const marker = want.marker || rt.missionGuide?.marker;
  const talk = !!want.unit && !!marker?.guideTalk;
  const simplePin = !talk && !want.defend && (want.flagDestination || rt.def.missionStyle === 'ford' && (want.crossing || want.waiting && !want.guardArea) || want.allyGather || want.route || rt.def.missionStyle === 'lesson' || rt.def.missionStyle === 'raid' || inouEnemy || !want.unit && !want.area && !want.waiting && !want.fire && !want.gate && !want.footRing && !want.defend && !want.treatment && !want.passage && !want.marker?.waitAction && !want.marker?.waitGuide && !rt.missionGuide?.marker?.waitAction && !rt.missionGuide?.marker?.waitGuide);
  pin.querySelector('svg').style.display = simplePin ? 'none' : '';
  if (pin._simplePin) pin._simplePin.style.display = simplePin ? '' : 'none';
  pin.classList.toggle('defend-location', !!want.defend);
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
  if (!!rt.def.missionStyle || want.route || want.approach || want.unit || want.area || want.waiting || want.fire || want.gate || rt.def.routeGuidePriority?.(rt)) {
    U.x = want.x; U.z = want.z; U.y = want.y ?? groundAt(rt.world, U.x, U.z, me.y);
  }
  const d = Math.hypot(want.x - me.x, want.z - me.z);
  // 会話の印は距離によらず残し、操作札は話せる時だけ出す。
  const near = talk || want.arrow || want.fire || want.gate || want.footRing || want.turn || want.doorFrame ? -2 : want.hide ?? (want.r ?? 6);
  if (pin._talk !== talk) {
    pin._talk = talk; pin._person.innerHTML = talk ? TALK_SIGN : pin._personShape;
  }
  const waiting = want.treatment || (want.waiting ?? (!want.unit && !!marker && (marker.waitAction || marker.waitGuide || /^(wait|guard)$/.test(marker.guideArea))));
  const arrived = want.treatment ? d <= (want.r ?? 3) : waiting ? (want.arrived ?? missionWaitReached(rt)) === true : !!want.arrived;
  // 同じ集合地点へ着いた瞬間を記録し、到着表示を保つ。
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
    const head = inouSignHeight(u);
    goalPoint.set(u.pos.x, u.pos.y + head, u.pos.z).project(rt.camera);
    const sx = (goalPoint.x + 1) * W / 2, sy = (1 - goalPoint.y) * H / 2;
    // 遠くの小さな▼や任務に隠れた▼だけでピンを消さない。
    enemyVisible = (rt.def.missionStyle === 'raid' || d <= 40) && goalPoint.z >= -1 && goalPoint.z <= 1 &&
      sx >= 24 && sx <= W - 24 && sy >= 32 && sy <= H - 24 &&
      !rects.some(r => sx + 20 >= r.left && sx - 20 <= r.right && sy >= r.top && sy - 32 <= r.bottom);
  }
  // 同じ本人の▼が見えたらピンを畳む。別々の目印で別の兵へ誘わない。
  if (enemyVisible) { pin.hidden = true; return; }
  // 案内役は頭上の人型と下矢印、自分は足元の輪。離れても同じ形で追えるようにする。
  const groundPerson = rt.def.missionStyle === 'raid' && want.unit && (want.footRing || want.follow);
  // 集合ピンは到着の前後とも同じ地面へ固定する。自分の印に見える追従をしない。
  // 判定の範囲へ入った瞬間に色と穴の進みに替え、中心まで歩かせない。
  if (rt.def.missionStyle === 'raid' && want.area) goalPoint.set(want.x, groundAt(rt.world, want.x, want.z, me.y) + .08, want.z);
  else if (inouEnemy) goalPoint.set(want.x, groundAt(rt.world, want.x, want.z, me.y) + .08, want.z);
  else if (want.allyGather || groundPerson) goalPoint.set(U.x, U.y + .08, U.z);
  else if (want.unit) goalPoint.set(want.unit.pos.x, want.unit.pos.y + (want.unit.mounted ? 3.3 : 2.1), want.unit.pos.z);
  // 一軒だけの戸口の上へ炎を付け、地面の輪は実際の足場へ残す。
  else if (want.fire) {
    const door = typeof marker?.pos === 'function' ? marker.pos() : marker?.pos;
    goalPoint.set(door?.x ?? U.x, (door?.y ?? U.y) + 2.7, door?.z ?? U.z);
  }
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
  // 矢印は頭へ固定し、同じ測定結果で本人の全身を囲む。
  const talkFrame = talk && !behind ? hud.measurePersonFrame(want.unit, rt, true) : null;
  if (talkFrame) { x = talkFrame.cx; y = talkFrame.headY - 6; }
  // 移動先は地面の足形。側面へ回る時だけ太い地面の矢印に替える。
  if (simplePin) {
    drawGroundDestination(rt, pin, want, x, y, behind || occluded, rects);
    return;
  }
  // 足元を別の場所へずらさず、札に隠れる時も端の矢印へ切り替える。
  //   画面の端・札の縁でも、前のコマと同じ形を少しの間は保つ（地面の旗と端の矢印が入れ替わり続けない）。
  // 人と戸口の印は実物へ固定する。札避けで別の人や空き地へ動かさない。
  const inFrame = x >= 32 && x <= W - 32 && y >= (rt.def.missionStyle === 'raid' ? 104 : 76) && y <= H - (want.fire ? 68 : 24);
  // 本人や入口の位置をずらさず、札に隠れる時は端の方向案内へ替える。
  const covered = rects.some(r => x + 28 >= r.left && x - 28 <= r.right && y + (want.fire ? 60 : 4) >= r.top && y - 68 <= r.bottom);
  // 火付けの足場が画面内なら、その地面を示し続ける。軒や柱との重なりで上端へ飛ばさない。
  const anchored = !!(rt.def.missionStyle === 'raid' || want.unit || want.fire || want.gate || want.passage || want.defensePoint || want.area || waiting);
  let outside = behind || occluded && !want.fire || (anchored
    ? !inFrame || rt.def.missionStyle !== 'raid' && (!want.fire && !talk && covered || inouEnemy && !goalFree(x, y, W, H, rects))
    : !goalFree(x, y, W, H, rects));
  // 到着時は同じ地面で色を替え、一拍後は待つ円を任務の下へ一本だけ置く。
  // 画面外や札の下へ隠れた時はすぐ移し、移動の矢印を付けない。
  const dockedWait = (rt.def.missionStyle === 'raid' || rt.def.missionStyle === 'ford') && waiting && arrived && (outside || covered || rt.t - U.arrivalAt >= ARRIVAL_CUE_SECONDS);
  if (dockedWait) {
    // 待つ円を任務のすぐ下へ。携帯でも任務と一緒に見える位置に保つ。
    x = W - 52;
    y = Math.min(H - 80, (hud.guideOrderRect?.bottom ?? 56) + 72);
    outside = false;
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
    y = side ? Math.max(104, Math.min(H - 68, y)) : dy >= 0 ? H - 68 : 104;
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
  const areaRadius = want.defend ? want.r ?? 8 : want.area ? want.r : waitArea ? want.r ?? 8 : footMark ? want.fire ? 1.25 : .85 : want.r;
  // 守備だけ、判定と同じ範囲を線と旗で囲む。内側は塗らない。
  const showArea = !!want.defend && !person && areaRadius > 0;
  pin._area.style.display = pin._areaBack.style.display = showArea ? '' : 'none';
  pin._areaFlags.style.display = showArea ? '' : 'none';
  pin._area.setAttribute('stroke-width', want.passage ? '3.5' : '2.2');
  pin._area.setAttribute('stroke-dasharray', want.passage ? '' : '9 7');
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
    let path = '', flags = '';
    for (let ring = 0; ring < (waitArea && !want.defend && rt.def.missionStyle !== 'raid' ? 2 : 1); ring++) {
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
        if (!ring && i < pin._areaPoints.length && i % 4 === 0) {
          const fx = (areaPoint.x + 1) * W / 2 - x + 40;
          const fy = (1 - areaPoint.y) * H / 2 - y + (outside ? 40 : 68);
          flags += `M${fx} ${fy}v-24h17l-5 6 5 6h-17`;
        }
        connected = true;
      }
      if (complete) path += 'Z';
    }
    pin._area.setAttribute('d', path);
    pin._areaBack.setAttribute('d', path);
    pin._areaFlags.setAttribute('d', flags);
    // 輪の内側全体が集合範囲。視点の後ろへ欠けた外周は閉じて塗らない。
    // 集合前は境界だけ。囲まれた兵を選ぶ印に見せず、到着した時だけ面を返す。
    pin._area.setAttribute('fill', 'none');
    pin._area.setAttribute('fill-opacity', '.12');
    // 守る時が決まっている時は、輪が残りの時で欠けていく（字を使わずに「いつまで」を見せる）。
    // 下地の暗い輪は一周のまま、明るい輪だけが減る。残りが少ないと朱へ。
    const left = want.defend && Number.isFinite(want.holdLeft) ? want.holdLeft : null;
    if (left != null) {
      pin._area.setAttribute('pathLength', '100');
      pin._area.setAttribute('stroke-dasharray', `${(left * 100).toFixed(1)} 200`);
      pin._area.setAttribute('stroke-width', '4.5');
      pin._area.setAttribute('stroke-opacity', '1');
      pin._area.setAttribute('stroke', left < .25 ? '#ff8a5c' : arrived ? '#e4f2cb' : '#fff3ba');
      pin._areaBack.setAttribute('stroke-width', '7');
    } else if (pin._area.hasAttribute('pathLength')) {
      pin._area.removeAttribute('pathLength');
      pin._area.setAttribute('stroke-opacity', '.8');
      pin._areaBack.setAttribute('stroke-width', '4.5');
    }
  }
  // 桶狭間はピンの先端を到着判定の地面に刺す。兵の頭上を指す矢印に替えない。
  // 森部の到着後は行き先の旗を畳み、同じ印の中に待つ進みを出す。
  const flagDestination = !(rt.def.missionStyle === 'ford' && waiting && arrived) && !person && !enemy && !want.fire && !want.gate && !want.dodge && (!want.turn || want.passage) && !want.defensePoint && !want.treatment;
  // 通る入口にも矢印を残し、人・敵・守る対象の印とは重ねない。
  const destinationArrow = rt.def.missionStyle !== 'raid' && (flagDestination || want.gate) && !arrived && !outside && !want.follow && !want.enemy && !want.defend;
  // 小旗の横に短い矢印を置き、同じ行き先の足場だけを指す。
  pin.querySelector('.goal-ground path').setAttribute('d', 'M35 40H45V53H52L40 68L28 53H35Z');
  pin.querySelector('.goal-ground path').style.display = destinationArrow ? '' : 'none';
  const flag = pin.querySelector('.goal-flag');
  // 桶狭間は地面に刺さる一点を示す。固定の小さな輪を到着範囲に見せない。
  const raid = rt.def.missionStyle === 'raid';
  if (!raid) for (const ring of pin._rings) {
    ring.removeAttribute('transform');
    ring.style.display = 'none';
  }
  // 到着は色も替える。歩いている間は穴を満たさず、待つ時計と混ぜない。
  if (raid) {
    const fill = arrived ? '#e4f2cb' : '#fff3ba';
    if (flag.getAttribute('fill') !== fill) flag.setAttribute('fill', fill);
  }
  // 集合地点のピンを保ち、普通の行き先は旗の形で区別する。
  const groundPin = raid || inouEnemy || flagDestination;
  // 普通の行き先は切れ込みのある旗。画面内外で同じ形を保つ。
  if (pin._groundPin !== groundPin || pin._wideHole !== raid || pin._flagDestination !== flagDestination || pin._passage !== want.passage || pin._outsideFlag !== outside || pin._waitArrived !== arrived || pin._waitWaiting !== waiting) {
    pin._outsideFlag = outside;
    pin._waitArrived = arrived;
    pin._waitWaiting = waiting;
    pin._groundPin = groundPin; pin._wideHole = raid; pin._flagDestination = flagDestination; pin._passage = want.passage;
    flag.setAttribute('d', groundPin && (raid || !flagDestination) ? raid
      // 到着しても穴の位置を保ち、同じ丸の中で待つ進みを示す。
      ? 'M40 68L34 58V57.4A30 30 0 1 1 46 57.4V58Z M40 8A20 20 0 1 0 40 48A20 20 0 1 0 40 8Z'
      : 'M40 68L25 38C5 9 75 9 55 38Z M40 20A6 6 0 1 0 40 32A6 6 0 1 0 40 20Z' : 'M32 65V5H65L56 18L65 31H32');
    flag.setAttribute('fill-rule', 'evenodd');
  }
  // 合図の時刻は範囲を出ても進む。同じピンの円も途切れさせない。
  const showProgress = (raid || rt.def.missionStyle === 'ford' && want.guardArea) && Number.isFinite(want.progress);
  // 接近中は穴の中を空ける。中の扇形が満ちるのは待ち時間だけ。
  // 接近は外周が閉じ、到着後の待ちは内側が満ちる。同じピンで区別する。
  const approaching = raid && want.area && !arrived && !waiting && !outside;
  const showArrival = raid && (arrived || approaching);
  const showHold = raid ? showProgress || showArrival : (arrived || want.guardArea) && (!person || want.footRing) && !want.defend && !outside && !flagDestination;
  flag.style.display = destinationArrow || (person && !groundPerson) || want.defend || inouEnemy || want.fire || want.gate || want.dodge || showHold && !raid ? 'none' : '';
  if (flagDestination && !raid) flag.style.display = '';
  if (flagDestination) pin.querySelector('.goal-ground path').style.display = 'none';
  // 通る床には旗を立て、短い下向き矢印の先を同じ輪の中心へ合わせる。
  if (want.passage && !outside) {
    flag.setAttribute('d', 'M32 65V5H65L56 18L65 31H32');
    pin.querySelector('.goal-ground path').style.display = '';
  }
  // 赤い▼は兵の頭上だけ。見失った時は同じ相手の足元へ金のピン一本を置く。
  if (inouEnemy) flag.style.display = '';
  const friendlyPerson = person && !raid && !enemy && (want.follow || want.footRing);
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
  // 待つ進みがある時は最初から時計を動かし、到着だけの合図は見届けられる長さを保つ。
  const arrivalCue = raid && arrived && (!showProgress || rt.t - U.arrivalAt < .6 || want.progress >= 1);
  pin._arrivedMark.style.display = arrivalCue ? '' : 'none';
  pin._arrivedMark.setAttribute('transform', '');
  pin._arrival.style.display = showArrival ? '' : 'none';
  pin._arrival.setAttribute('stroke', arrived ? '#e4f2cb' : '#fff3ba');
  // 判定の外側の十二歩で縁が閉じる。満ち切る位置は実際の到着範囲と同じ。
  // 中の扇形は待つ時間だけに使い、接近中は空けておく。
  const arrivalProgress = arrived ? 1 : approaching
    ? Math.max(0, Math.min(.98, 1 - Math.max(0, d - want.r) / 12)) : 0;
  // 作成時の一周を１とする指定に合わせ、縁の進みを正規化する。
  pin._arrival.setAttribute('stroke-dasharray', '1');
  pin._arrival.setAttribute('stroke-dashoffset', String(1 - arrivalProgress));
  // 桶狭間は到着しても同じピンを残し、その穴の中だけで待ちの進みを示す。
  // 別の時計へ替えず、待つ場所と満ち切る合図を一つにする。
  if (pin._holdOke !== raid) {
    pin._holdOke = raid;
    pin._hold.children[2].style.display = raid ? 'none' : '';
    pin._hold.children[3].style.display = raid ? 'none' : '';
    pin._hold.children[0].setAttribute('stroke', raid ? 'none' : '#fff3ba');
    pin._progress.setAttribute('fill', raid ? '#fff3ba' : '#e8c25a');
    pin._progress.setAttribute('stroke', 'none');
    pin._progress.setAttribute('stroke-width', '0');
    // 到着の内周と、満ちていく扇形だけで待つ進みを示す。
    pin._arrival.style.filter = 'drop-shadow(0 0 2px #14120f)';
  }
  if (raid) pin._hold.children[0].setAttribute('stroke', arrived ? '#fff3ba' : 'none');
  if (!arrived && !showProgress) pin._progress.setAttribute('d', '');
  if (arrived || showProgress) {
    // 守備も空から満ちる扇形にそろえ、移動中の絵と進む向きを逆にしない。
    const progress = Number.isFinite(want.progress) ? Math.max(0, Math.min(1, want.progress)) : 0;
    // 進み具合が不明でも砂時計を出し、完了を思わせる印にはしない。
    // 満ち切る直前まで扇形。完了は円にして合図の時刻とそろえる。
    const angle = Math.PI * 2 * Math.min(progress, .9999);
    pin._progress.setAttribute('d', progress >= 1
      ? 'M40 8A20 20 0 1 1 40 48A20 20 0 1 1 40 8'
      : progress > 0 ? `M40 28L40 8A20 20 0 ${progress > .5 ? 1 : 0} 1 ${40 + Math.sin(angle) * 20} ${28 - Math.cos(angle) * 20}Z` : '');
  }
  pin._progress.style.display = arrivalCue ? 'none' : '';
  // 桶狭間は針と目盛りで扇形を覆わず、空から満ち切る円だけで残る待ちを示す。
  // 森部は到着済みの同じピンで時間を刻む。砂時計で扇形を覆わない。
  // 持ち場へ戻る間も同じピンを満たし、逃げた途端に進みを隠さない。
  const moribeClock = rt.def.missionStyle === 'ford' && (arrived || want.guardArea) && Number.isFinite(want.progress);
  if (rt.def.missionStyle === 'ford') {
    pin._hold.children[2].style.display = pin._hold.children[3].style.display = moribeClock ? 'none' : '';
  }
  // 雨待ちもピンの中の目盛りが一秒ずつ減る。別の時計や秒の字は足さない。
  const raidClock = raid && arrived && showProgress && !arrivalCue && want.waitDuration > 0;
  const clock = moribeClock || raidClock;
  const guardClock = moribeClock && want.guardArea && want.waitDuration > 0;
  pin._guardClock.style.display = guardClock ? '' : 'none';
  pin._waitTicks.style.display = clock ? '' : 'none';
  pin._waitHand.style.display = moribeClock && !guardClock ? '' : 'none';
  pin._waitTicks.setAttribute('stroke-width', '1.5');
  pin._waitTicks.setAttribute('stroke', guardClock ? '#14120f' : '#fff3ba');
  if (clock) {
    // 守備は読める十目盛り。百本の細線で扇形を隠さず、満ちる量で終わりを示す。
    const duration = guardClock ? 10 : raidClock ? want.waitDuration : 12;
    const remaining = raidClock ? Math.ceil((1 - Math.max(0, Math.min(1, want.progress))) * duration) : duration;
    if (pin._tickDuration !== duration || pin._tickRemaining !== remaining) {
      pin._tickDuration = duration; pin._tickRemaining = remaining;
      let path = '';
      for (let i = 0; i < remaining; i++) {
        const angle = (raidClock ? duration - remaining + i : i) * Math.PI * 2 / duration;
        const sx = Math.sin(angle), sy = -Math.cos(angle);
        const inner = guardClock ? 17 : 16;
        path += `M${40 + sx * inner} ${28 + sy * inner}L${40 + sx * 20} ${28 + sy * 20}`;
      }
      pin._waitTicks.setAttribute('d', path);
    }
    pin._waitHand.setAttribute('transform', `rotate(${Math.min(1, Math.max(0, want.progress)) * 360} 40 28)`);
  }
  // 端では同じ旗を矢印の上へ置き、見えている時は目的の人や床に竿を合わせる。
  const edgeFlag = outside && !person && !raid && !arrived && !enemy && !want.fire && !want.gate && !want.dodge && !want.treatment;
  if (edgeFlag) {
    flag.style.display = '';
    flag.setAttribute('d', 'M32 65V5H65L56 18L65 31H32');
    pin._person.style.display = 'none';
    pin._gate.style.display = 'none';
  }
  if (!raid) flag.setAttribute('transform', outside ? edgeFlag ? 'translate(14,-34) scale(.65)' :
    groundPin ? 'translate(0,-24) scale(.75)' : 'translate(0,-24)' : groundPin ? '' : 'translate(16,19.25) scale(.75)');
  // 到着しても穴を動かさず、別の行き先に切り替わったように見せない。
  if (!raid) pin._hold.setAttribute('transform', '');
  // 待機中は同じ一本だけを拡大し、携帯でも残る扇形を読めるようにする。
  pin.firstElementChild.style.transformOrigin = '40px 68px';
  pin.firstElementChild.style.transform = guardClock || raid && arrived && showProgress && !arrivalCue ? 'scale(1.35)' : '';
  // 方向は端の旗一本へまとめ、自分の足元には輪だけを残す。
  // 行き先の輪は足さず、自分の水色の足元印と役割を分ける。
  const groundRing = false;
  if (pin._ringsOn !== groundRing) { // 地面のピンの _groundRing（輪の要素）と名を分ける。守る段→敵のピンで落ちていた。
    pin._ringsOn = groundRing;
    for (const ring of pin._rings) ring.style.display = groundRing ? '' : 'none';
  }
  const arrow = pin.querySelector('.goal-edge');
  const turn = want.turn && !outside && !want.passage && !want.marker?.waitAction && !want.marker?.waitGuide && !rt.missionGuide?.marker?.waitAction && !rt.missionGuide?.marker?.waitGuide;
  // 人型・炎・門は端の矢印と組み合わせ、地面のピンは一本で方向を示す。
  arrow.style.display = (edgeFlag || !groundPin && !inouEnemy) && !arrived && (outside || turn && !person) ? '' : 'none';
  if (edgeFlag) pin._shield.style.display = 'none';
  if (arrived && outside) { if (!raid) flag.style.display = 'none'; pin._shield.style.display = 'none'; }
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
  if (groundPin && outside && !edgeFlag && !raid) {
    if (want.passage) flag.setAttribute('d', 'M10 29H43V12L72 40L43 68V51H10Z');
    flag.setAttribute('transform', `translate(40,40) rotate(${Math.atan2(dy, dx) * 180 / Math.PI - 90}) ${raid ? 'scale(.8) translate(-40,-8)' : 'translate(-40,-40)'}`);
    pin._hold.setAttribute('transform', `${flag.getAttribute('transform')} ${raid ? 'translate(4,-17.2) scale(.9)' : 'translate(22,13.4) scale(.45)'}`);
  }
  // 旗の形を回さず、向きは添えた矢印で示す。
  if (want.passage && !outside) flag.setAttribute('transform', 'translate(-22,0)');
  // 到着後は先端を畳み、集合で見たピンの穴で待ち時間を示す。
  if (raid) {
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
    // 集合はピン一本で示し、足元の輪は重ねない。
    // 到着後も輪を出さず、画面端の丸を次の集合場所に見せない。
    for (const ring of pin._rings) {
      ring.style.display = 'none';
    }
    if (waiting && arrived) {
      // 待つ間もピンの形を保ち、その穴で残り時間を見せる。
      // 別の砂時計に見せず、集合から雨上がりまで同じ印を使う。
      flag.style.display = '';
      pin._hold.setAttribute('transform', holdTransform);
      pin._hold.children[0].setAttribute('stroke', '#e4f2cb');
      // 集合範囲へ入ったことと待ちの完了をチェックで示し、中心まで歩かせない。
      // 待つ間は同じ穴の扇形を満たし、別の時計へ切り替えない。
      pin._arrivedMark.style.display = arrivalCue ? '' : 'none';
      pin._arrivedMark.removeAttribute('transform');
    }
  }
  hud.missionPinOutside = outside;
  if (friendlyPerson && !outside) {
    pin._person.style.display = '';
    pin._hold.style.display = 'none';
  }
  pin._fire.style.display = want.fire ? '' : 'none';
  // 炎そのものを行き先に固定し、下向きの矢印を重ねない。
  if (want.fire) pin.querySelector('.goal-ground path').style.display = 'none';
  if (flagDestination && !raid && !outside) {
    flag.setAttribute('d', 'M32 65V5H65L56 18L65 31H32');
    flag.setAttribute('transform', 'translate(-6,-5)');
    pin.querySelector('.goal-ground path').style.display = '';
  }
  // 炎の下端を輪より上へ離し、立つ足場を隠さない。
  pin._fire.setAttribute('transform', outside ? 'translate(14,-34) scale(.65)' : 'translate(14,23) scale(.65)');
  const action = want.fire || talk ? rt.nearestInteract() : null;
  const actionPos = talk && action && (typeof action.pos === 'function' ? action.pos() : action.pos);
  const talking = talk && !!actionPos && !action.hold && /話す|話を聞く/.test(action.label) &&
    Math.hypot(actionPos.x - want.unit.pos.x, actionPos.z - want.unit.pos.z) < 1;
  const working = !!action && (talking || want.fire && /火/.test(action.label) && action.id === marker?.id);
  const label = pin._label;
  label.style.top = '72px'; label.style.left = '50%';
  pin._guardSign.style.display = 'none';
  // 守備はその場所・本人のそばへ、火付けは押せる札へまとめる。
  const text = want.defend ? '' : talking ? 'この人と話す' : rt.def.missionStyle !== 'lesson' && working ? action.hold ? '火をつける（長押し）' : '火をつける' : '';
  if (pin._words.textContent !== text) pin._words.textContent = text;
  pin.classList.toggle('fire-action', working && !talking);
  pin.classList.toggle('talk-action', talking);
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
  // 火付けは画面下、会話は本人のそばへ。同じ釦を使い回す。
  if (working && !talking) {
    label.style.left = `${W / 2 - x + 40}px`;
    label.style.top = `${H - 80 - y + (outside ? 40 : 68)}px`;
  }
  // 守備の一行は旗のすぐ横へ移し、右上には同じ任務を重ねない。
  if (want.defend) {
    label.style.left = `${Math.max(96, Math.min(W - 96, x)) - x + 40}px`;
    label.style.top = `${Math.max(48, Math.min(H - 52, y - 76)) - y + (outside ? 40 : 68)}px`;
    label.style.fontSize = 'max(16px, calc(16px * var(--text-scale, 1)))';
  } else label.style.fontSize = '';
  if (talking) {
    // 頭上の矢印と全身の囲みを空け、札を本人の脇へ置く。
    const half = 76, gap = 24;
    const right = !outside && talkFrame ? talkFrame.right : x + 24;
    const left = !outside && talkFrame ? talkFrame.left : x - 24;
    const cx = right + gap + half <= W - 16 ? right + gap + half : left - gap - half;
    const cy = !outside && talkFrame ? (talkFrame.top + talkFrame.bottom) / 2 : y;
    label.style.left = `${Math.max(half + 16, Math.min(W - half - 16, cx)) - x + 40}px`;
    label.style.top = `${Math.max(80, Math.min(H - 80, cy - 30)) - y + (outside ? 40 : 68)}px`;
  }
  label.style.pointerEvents = working ? 'auto' : 'none';
  label.style.minHeight = talking ? '60px' : working ? '52px' : '0';
  label.style.width = talking ? '152px' : working ? '208px' : 'max-content';
  label.style.border = talking ? '3px solid #fff3ba' : working ? '2px solid #fff3ba' : '0';
  label.style.borderRadius = talking ? '12px' : '4px';
  label.style.boxShadow = talking ? '0 0 0 3px #14120f, 0 4px 0 3px #14120f' : 'none';
  label.style.fontSize = talking ? 'max(28px, calc(28px * var(--text-scale, 1)))' : want.defend ? 'max(16px, calc(16px * var(--text-scale, 1)))' : 'max(22px, calc(22px * var(--text-scale, 1)))';
  label.style.padding = talking ? '8px 12px' : working ? '8px 12px 14px' : '4px 8px';
  label.style.background = working ? '#29251c' : '#14120f';
  label.tabIndex = working ? 0 : -1;
  if (pin._work && pin._work !== (working ? action.id : null) && hud.workHoldId === pin._work) hud.workHoldId = null;
  // 待機の図形を長押しの真偽値で上書きしない。次の更新でも同じ図形を使う。
  pin._work = working ? action.id : null; pin._workHold = working && !!action.hold; pin._hud = hud; pin._rt = rt;
  hud.missionPinLabelShown = !!text;
  // 人を示す任務札から同じ足元へ一本だけつなぐ。札は増やさない。
  let linkPath = '', outlinePath = '';
  // 案内役は本人の頭上の印で示し、体を横切る線を足さない。
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
  // 会話相手は遠くでも太い明暗の縁で囲む。中は塗らず姿を残す。
  if (talkFrame && !outside) {
    const cx = talkFrame.cx, cy = (talkFrame.top + talkFrame.bottom) / 2;
    const rx = Math.max(18, (talkFrame.right - talkFrame.left) / 2 + 8);
    const ry = Math.max(28, (talkFrame.bottom - talkFrame.top) / 2 + 6);
    outlinePath = `M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${rx * 2} 0a${rx} ${ry} 0 1 0 ${-rx * 2} 0`;

  }
  let badgePath = '';
  // 到着前後とも同じ実旗を囲む。兵に遮られても輪と縁は画面の手前に残す。
  const guardFlag = !raid && !person && !want.fire && !want.gate && !want.treatment && (marker?.guideFlag || marker?.guideFlagMesh || marker?.guideFlagFrame)
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
  pin._outlines[0].setAttribute('stroke-width', talkFrame ? '10' : '4.5');
  pin._outlines[1].setAttribute('stroke-width', talkFrame ? '5' : '2.2');
  for (const path of pin._outlines) path.setAttribute('stroke-opacity', talkFrame ? '1' : '.85');
  pin._outlines[0].setAttribute('fill', 'none');
  pin._lines.style.display = linkPath || outlinePath || badgePath ? '' : 'none';
  // 丸めず小数一桁で置き、地面に固定する。
  pin.style.transform = `translate(${(x - 40).toFixed(1)}px,${(y - (outside ? 40 : 68)).toFixed(1)}px)`;
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

// 集合の台座は画面へ重ねず、実際の地面で兵や斜面との前後を保つ。
// 一戦に一つだけ作り、移動先が変わった時だけ頂点を更新する。
function drawJoinGround(rt, want, visible) {
  let ring = rt.missionJoinRing;
  if (!ring && visible) {
    ring = rt.missionJoinRing = new THREE.Mesh(new THREE.RingGeometry(1, 1.03, 64),
      new THREE.MeshBasicMaterial({ color: 0xffe28a, side: THREE.DoubleSide,
        depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    ring.frustumCulled = false;
    rt.scene.add(ring);
    rt.cleanupTasks?.add(() => {
      rt.scene.remove(ring); ring.geometry.dispose(); ring.material.dispose();
    });
  }
  if (!ring) return;
  ring.visible = visible;
  if (!visible) return;
  if (ring.userData.x !== want.x || ring.userData.z !== want.z || ring.userData.r !== want.r || ring.userData.arrived !== !!want.arrived) {
    const positions = ring.geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      const angle = (i % 65) * Math.PI * 2 / 64;
      // 外縁が到着判定そのもの。線の内側へ入れば集合できる。
      // 着いたら輪を太く・緑にして、中へ入れた事を色と形で返す（ゲーマーの bot 10/28）。
      const radius = i < 65 ? Math.max(0, want.r - (want.arrived ? .55 : .28)) : want.r;
      const x = want.x + Math.cos(angle) * radius, z = want.z + Math.sin(angle) * radius;
      positions.setXYZ(i, x, groundAt(rt.world, x, z, rt.player.u.pos.y) + .025, z);
    }
    positions.needsUpdate = true;
    ring.userData.x = want.x; ring.userData.z = want.z; ring.userData.r = want.r; ring.userData.arrived = !!want.arrived;
  }
  ring.material.color.setHex(want.guardBoundary ? 0xffffff : want.arrived ? 0xa8ef80 : 0xffe28a);
}

function drawGroundDestination(rt, el, want, x, y, hidden, rects) {
  if (!el._simplePin) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '80'); svg.setAttribute('height', '80');
    svg.setAttribute('viewBox', '0 0 80 80'); svg.setAttribute('aria-hidden', 'true');
    svg.style.overflow = 'visible';
    svg.innerHTML = '<g fill="none"><ellipse rx="29" ry="9" stroke="#14120f" stroke-width="9"/><ellipse rx="29" ry="9" stroke="#fff3ba" stroke-width="4"/></g><path d="M-15-5H3V-13L18 0L3 13V5H-15Z" fill="#fff3ba" stroke="#14120f" stroke-width="4" stroke-linejoin="round"/>';
    el.appendChild(svg); el._simplePin = svg;
    el._simpleRing = svg.firstChild; el._routeEdge = svg.lastChild;
    const word = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    word.textContent = 'こっち';
    word.setAttribute('x', '0'); word.setAttribute('y', '42');
    word.setAttribute('text-anchor', 'middle');
    word.style.cssText = 'font:bold 16px sans-serif;fill:#fff3ba;stroke:#14120f;stroke-width:5px;paint-order:stroke;stroke-linejoin:round';
    svg.appendChild(word); el._routeWord = word;
  }
  el._label.hidden = true;
  // 稲生は見せ場の黒帯の間も、残りの敵へのピンを消さない（テスター 10/25「倒せが残るのに場所が分からない」）。
  el.classList.toggle('cine-keep', rt.def.missionStyle === 'lesson');
  el._label.style.top = '-90px';
  el._label.style.left = '0';
  el._work = null; el.classList.remove('fire-action');
  const W = VIEW.w, H = VIEW.h;
  const sa = safeInsets();
  const outside = hidden || x < sa.left + 48 || x > W - sa.right - 48 || y < sa.top + 64 || y > H - sa.bottom - 24 || !inouPinFree(x, y, rects);
  // 渡河も到着前後で同じピンを使う。待機中に画面端の矢印へ戻さない。
  const ford = rt.def.missionStyle === 'ford' && (want.crossing || want.waiting && !want.guardArea);
  const raid = rt.def.missionStyle === 'raid' || ford;
  // 行き先は旗。戦う相手の刀と、画面内外とも形で区別する。
  const flagDestination = want.flagDestination || !raid && rt.def.missionStyle !== 'lesson';
  if (flagDestination && !el._destinationFlag) {
    const flag = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    flag.setAttribute('d', 'M-5 0V-55H30L20-42L30-29H-5');
    flag.setAttribute('fill', '#fff3ba'); flag.setAttribute('stroke', '#14120f');
    flag.setAttribute('stroke-width', '5'); flag.setAttribute('stroke-linejoin', 'round');
    el._simplePin.appendChild(flag); el._destinationFlag = flag;
  }
  if (el._destinationFlag) el._destinationFlag.style.display = flagDestination ? '' : 'none';
  // 敵を見失った時も行き先のピンを保ち、味方の横に浮かぶ矢印へ替えない。
  const enemyPin = rt.def.missionStyle === 'lesson' && want.unit?.team !== undefined && want.unit.team !== rt.player.u.team;
  const destinationPin = raid || enemyPin;
  const joined = raid && (want.area || ford) && want.arrived;
  // 桶狭間は下のピンを回して使う。他の戦の矢印だけをここに残す。
  el._routeEdge.setAttribute('d', 'M-15-5H3V-13L18 0L3 13V5H-15Z');
  el._routeEdge.setAttribute('fill-rule', 'evenodd');
  const waiting = joined && want.waiting && Number.isFinite(want.progress);
  // 集合できた後は移動の矢印を出さず、隠れた輪を任務の下へ移す。
  // 待ち始めたら任務の下へ固定し、集合地点が画面外でも残る時間を見せる。
  const docked = joined && (outside || waiting);
  if (docked) {
    x = W - 52;
    y = Math.min(H - 68, (rt.hud.guideOrderRect?.bottom ?? 56) + 84);
  }
  // 守る輪は視線の高さへ持ち上げ、細い軸で本来の守備地点につなぐ。
  const defend = rt.def.missionStyle === 'lesson' && want.defend;
  let stem = '';
  if (defend && !outside) {
    const footY = y;
    y = Math.max(H * .35, Math.min(H * .58, y - 72));
    stem = `M${x} ${y}V${footY}`;
  }
  el._simpleRing.setAttribute('transform', defend ? 'scale(1.6 2.4)' : '');
  el._routeEdge.style.scale = defend ? '1.6' : '';
  // 桶狭間は到着後も同じピン。別の輪へ変えず、穴の中で到着と残る待ちを返す。
  // 自分の輪と混ぜず、移動先は画面の内外とも同じ矢印で示す。
  const travelArrow = !raid && !want.arrived && !defend;
  el._simpleRing.style.display = (outside && !docked || raid || travelArrow) ? 'none' : '';
  el._routeEdge.style.display = !destinationPin && (travelArrow || outside && !docked) || want.allyGather ? '' : 'none';
  if (flagDestination) {
    el._simpleRing.style.display = 'none';
    // 通り口の旗には向きを添える。足あとや相手の印は重ねない。
    el._routeEdge.style.display = want.route || outside ? '' : 'none';
  }
  el._routeWord.style.display = el._routeEdge.style.display !== 'none' && goalLabelRoom(rt.hud) ? '' : 'none';
  if (!outside || docked) el._routeEdge.setAttribute('transform', 'rotate(90)');
  // 集合先も同じ矢印。下向きの先端を集合地点に合わせる。
  if (want.allyGather && !outside) {
    el._routeEdge.setAttribute('transform', 'translate(0 -18) rotate(90)');
  }
  el._simpleRing.lastChild.setAttribute('stroke', want.arrived ? '#e4f2cb' : '#fff3ba');
  // 待機は任務の下で円に起こす。地面の薄い輪と区別し、残る時間を読める大きさにする。
  el._simpleRing.setAttribute('transform', raid ? 'translate(0 -30) scale(.72 2.3)' : docked ? 'scale(1 3.2)' : '');
  // 集合先は先端までつながったピン一本。丸と短い軸を離して描かない。
  if (destinationPin && !el._destinationStem) {
    const stem = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    const path = 'M0 0C-6-12-27-23-27-40A27 27 0 1 1 27-40C27-23 6-12 0 0Z';
    stem.innerHTML = `<path d="${path}" fill="#14120f" stroke="#14120f" stroke-width="10" stroke-linejoin="round"/><path d="${path}" fill="none" stroke="#fff3ba" stroke-width="4" stroke-linejoin="round"/>`;
    el._simplePin.appendChild(stem); el._destinationStem = stem;
  }
  if (el._destinationStem) {
    // 待つ間も同じピンの穴で時計を動かし、別の兵の印へ替わったように見せない。
    el._destinationStem.style.display = destinationPin ? '' : 'none';
    el._destinationStem.setAttribute('transform', '');
    el._destinationStem.lastChild.setAttribute('stroke', want.enemy ? '#ff342e' : joined ? '#e4f2cb' : '#fff3ba');
  }
  // 同じ輪の内側で接近・集合・待つ進みを示す。図形は作り直さない。
  if (raid && !el._joinCue) {
    const cue = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    cue.innerHTML = '<ellipse rx="22" ry="6.8" fill="none" stroke="#fff3ba" stroke-width="2" pathLength="1"/><path d="M-8 0L-2 5L9-6" fill="none" stroke="#e4f2cb" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path fill="#fff3ba" transform="scale(1 .31)"/>';
    el._simplePin.appendChild(cue); el._joinCue = cue;
    // 同じピンの穴を残り時間の円グラフにする。針は重ねない。
    const dial = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    dial.innerHTML = '<circle r="21" fill="#514a37"/><path fill="#fff3ba"/><path fill="none" stroke="#14120f" stroke-width="2"/>';
    el._simplePin.appendChild(dial); el._waitDial = dial;

  }
  if (el._joinCue) {
    const cue = el._joinCue;
    cue.setAttribute('transform', raid ? 'translate(0 -40) scale(1 3.2)' : docked ? 'scale(1 3.2)' : '');
    cue.style.display = raid && (want.area || ford) && (!outside || docked) ? '' : 'none';
    // 接近は穴の縁が閉じる動き、待つ時間は減る円で分ける。
    // 縁が閉じ切る所を実際の合流判定にそろえ、中心を踏ませない。
    cue.firstChild.style.display = joined ? 'none' : '';
    // 到着済みの形は同じピンの中へ残す。
    cue.children[1].style.display = joined ? '' : 'none';
    // 待機中も到着済みの形をピンの先端側へ残し、残り時間の円と重ねない。
    // 雨待ちの最初から時計を出すので、到着の形も最初から先端へ小さく寄せる（せっかちの bot 10/28）。
    cue.children[1].setAttribute('transform', waiting && want.progress < 1 ? 'translate(0 10) scale(.6 .3)' : '');
    cue.firstChild.setAttribute('stroke-dasharray', '1');
    const distance = Math.hypot(want.x - rt.player.u.pos.x, want.z - rt.player.u.pos.z);
    const approach = ford ? Math.max(0, Math.min(1, want.progress || 0)) :
      Math.max(0, Math.min(1, 1 - Math.max(0, distance - want.r) / 12));
    cue.firstChild.setAttribute('stroke-dashoffset', String(1 - approach));
    const progress = waiting ? Math.max(0, Math.min(1, want.progress)) : 0;
    // ピンの穴は残り時間の円だけにし、砂時計で目盛りを覆わない。
    cue.lastChild.style.display = 'none';
    const sand = Math.round(progress * 100);
    const dial = el._waitDial;
    // 雨待ちの最初から残る円を見せ、到着のチェックで時計を隠さない。
    dial.style.display = waiting && progress < 1 ? '' : 'none';
    dial.setAttribute('transform', 'translate(0 -40)');
    if (waiting) {
      // 残る扇形を一方向に減らす。一秒の目盛りも同じ穴の中に刻む。
      const duration = Math.max(1, Math.min(60, Math.round(want.waitDuration || 10)));
      if (dial._sand !== sand) {
        dial._sand = sand;
        const remaining = 1 - progress, angle = remaining * Math.PI * 2;
        const path = remaining >= .9999 ? 'M0-21A21 21 0 1 1 0 21A21 21 0 1 1 0-21Z' :
          `M0 0L0-21A21 21 0 ${remaining > .5 ? 1 : 0} 1 ${Math.sin(angle) * 21} ${-Math.cos(angle) * 21}Z`;
        dial.children[1].setAttribute('d', path);
      }
      const elapsed = Math.floor(progress * duration);
      if (dial._duration !== duration || dial._elapsed !== elapsed) {
        dial._duration = duration; dial._elapsed = elapsed;
        let ticks = '';
        for (let i = 1; i < duration - elapsed; i++) {
          const angle = i * Math.PI * 2 / duration;
          ticks += `M0 0L${Math.sin(angle) * 21} ${-Math.cos(angle) * 21}`;
        }
        dial.lastChild.setAttribute('d', ticks);
      }
    }
  }

  if (outside && !docked) {
    rt.camera.getWorldDirection(goalDirection);
    const yaw = Math.atan2(goalDirection.x, goalDirection.z), me = rt.player.u.pos;
    const gx = want.x - me.x, gz = want.z - me.z;
    const dx = -gx * Math.cos(yaw) + gz * Math.sin(yaw);
    const dy = -(gx * Math.sin(yaw) + gz * Math.cos(yaw));
    if (Math.hypot(dx, dy) < .001) { el.hidden = true; return; }
    const side = Math.abs(dx) / Math.max(1, W / 2 - 92) >= Math.abs(dy) / Math.max(1, H / 2 - 86);
    const baseX = side ? dx >= 0 ? W - sa.right - (enemyPin ? 36 : 92) : sa.left + (enemyPin ? 36 : 92) : W / 2;
    const baseY = defend ? H * .5 : side ? H / 2 : dy >= 0 ? H - 68 : 104;
    let found = false;
    for (let i = 0; i <= 40; i++) {
      const offset = Math.ceil(i / 2) * 18 * (i % 2 ? 1 : -1);
      x = baseX + (side ? 0 : offset); y = baseY + (side ? offset : 0);
      if (x < sa.left + (enemyPin ? 32 : 48) || x > W - sa.right - (enemyPin ? 32 : 48) || y < sa.top + 64 || y > H - sa.bottom - 24 || !inouPinFree(x, y, rects)) continue;
      found = true; break;
    }
    if (!found) { el.hidden = true; return; }
    el._routeEdge.setAttribute('transform', `rotate(${Math.atan2(dy, dx) * 180 / Math.PI})`);
    // 画面外でも同じピンを回すだけ。丸い別の印へ切り替えない。
    if (destinationPin) el._destinationStem.setAttribute('transform', `rotate(${Math.atan2(dy, dx) * 180 / Math.PI - 90}) translate(0 40)`);
  }
  // ついて行く組の旗は一つだけ囲む。行き先の輪は実際の移動先に残す。
  let outline = '';
  // 集合はピン一本。地面の輪を重ねず、穴が閉じたら到着の形へ替える。
  if (rt.def.missionStyle === 'lesson' && want.marker?.group) {
    const group = want.marker.group;
    const flag = rt.hud.goalFlagBounds(rt, want.marker, group.anchor);
    if (flag) {
      const l = Math.max(8, flag.left), t = Math.max(8, flag.top);
      const r = Math.min(W - 8, flag.left + flag.width), b = Math.min(H - 8, flag.top + flag.height);
      if (r - l >= 24 && b - t >= 24) {
        outline = `M${l} ${t}H${r}V${b}H${l}Z`;
        rt.hud.missionFlagFrame = flag;
      }
    }
  }
  for (const path of el._links) path.setAttribute('d', stem);
  for (const path of el._outlines) path.setAttribute('d', outline);
  el._outlines[0].setAttribute('fill', 'none');
  el._outlines[1].setAttribute('stroke', '#fff3ba');
  el._targetBadge.setAttribute('d', '');
  el._lines.style.display = stem || outline ? '' : 'none';
  rt.hud.missionPinLabelShown = el._routeWord.style.display !== 'none';
  el.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`;
  el.hidden = false;
  rt.hud.missionPinOutside = outside && !docked;
}

function inouPinFree(x, y, rects) {
  const side = 80, bottom = 60;
  for (const r of rects) if (x + side > r.left && x - side < r.right && y + bottom > r.top && y - 100 < r.bottom) return false;
  return true;
}
// 自分の白い輪は画面の手前に描き、重なる兵や馬に隠さない。
let playerFoot = null;
function updatePlayerFoot(rt) {
  const active = !rt.def.noPlayerFoot && pinGuideOn(rt) && !rt.over && !rt.choice && !rt.hud.introWaiting &&
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
const areaEnd = new THREE.Vector3();
const flagFootPoint = new THREE.Vector3();
const playerPoint = new THREE.Vector3();
const pinAt = { x: 0, z: 0, y: 0, ox: 0, oy: 0, at: 0, rt: null };
function goalFree(x, y, W, H, rects) {
  // 輪と旗は八十画素。実寸と余白だけを避け、携帯横でも案内を畳まない。
  if (x < 96 || x > W - 96 || y < 104 || y > H - 68) return false;
  for (const r of rects) if (x + 96 >= r.left && x - 96 <= r.right && y + 64 >= r.top && y - 76 <= r.bottom) return false;
  return true;
}
