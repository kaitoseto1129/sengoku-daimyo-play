// 行き先は旗。画面外では端の方向矢印に同じ旗を添える。
//   戦の定義の missionPin(rt) が { x, z, r } を返す間だけ立てる（r＝着いたとみなす半径。定義の判定と同じ値を返す）。
//   待つ場所は着いても残す。印と投影用の点は一つを使い回す。
import * as THREE from 'three';
import { VIEW } from './viewport.js';
import { currentObjective, missionWaitReached, missionFollowTarget } from './mission_guide.js';
import { groundAt } from './floors.js';
import { cameraWallBlocked } from './battle_sight.js';

let pin = null;
function make() {
  const el = document.createElement('div');
  el.id = 'mission-goal';
  el.innerHTML = '<svg width="80" height="80" viewBox="0 0 80 80" aria-hidden="true"><g class="goal-ground" stroke-linejoin="round"><ellipse cx="40" cy="68" rx="30" ry="9" fill="none" stroke="#14120f" stroke-width="10"/><ellipse cx="40" cy="68" rx="30" ry="9" fill="none" stroke="#fff3ba" stroke-width="5"/><path d="M32 8H48V37H61L40 59L19 37H32Z" fill="#fff3ba" stroke="#14120f" stroke-width="4"/></g><path class="goal-edge" d="M12 31H43V17L69 40L43 63V49H12Z" fill="#fff3ba" stroke="#14120f" stroke-width="4" stroke-linejoin="round" style="display:none;transform-origin:40px 40px"/></svg>';
  el.style.cssText = 'position:absolute;left:0;top:0;width:80px;height:80px;pointer-events:none;z-index:3';
  const style = document.createElement('style');
  style.textContent = '#hud.photo :is(#mission-goal,#mission-flag-frame),#hud.ending :is(#mission-goal,#mission-flag-frame),#hud:has(#bigmap:not([hidden])) :is(#mission-goal,#mission-flag-frame),#hud:has(#cine.on) :is(#mission-goal,#mission-flag-frame){display:none}' +
    '#hud.field-clean:has(#mission-goal.fire-action:not([hidden])) #prompt.work-action{display:none!important}' +
    '#mission-goal .goal-label{touch-action:none;user-select:none;box-sizing:border-box}' +
    '#mission-goal.fire-action .goal-label:focus-visible{outline:3px solid #fff;outline-offset:3px}' +
    '#mission-goal .fire-progress{position:absolute;bottom:4px;left:8px;right:8px;height:5px;background:#615745}' +
    '#mission-goal .fire-progress i{display:block;height:100%;background:#fff3ba;width:var(--fire-progress,0%)}';
  el.appendChild(style);
  const label = document.createElement('button');
  label.type = 'button'; label.className = 'goal-label'; label.tabIndex = -1;
  label.style.cssText = 'position:absolute;top:72px;left:50%;transform:translateX(-50%);white-space:nowrap;background:#14120f;color:#fff3ba;border:0;border-radius:4px;padding:4px 8px;font:bold max(16px, calc(16px * var(--text-scale, 1))) sans-serif;line-height:1.4;pointer-events:none';
  el.appendChild(label); el._label = label;
  const words = document.createElement('span'); label.appendChild(words); el._words = words;
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
    el._hud.workHoldId = it.id; label.setPointerCapture(event.pointerId);
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture', 'blur']) label.addEventListener(type, release);
  label.addEventListener('keydown', event => {
    if (!el._work || !['Enter', ' '].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation();
    const rt = el._rt;
    if (!rt.over && !rt.game.paused && rt.player.u.alive && rt.nearestInteract()?.id === el._work) el._hud.workHoldId = el._work;
  });
  label.addEventListener('keyup', event => { if (['Enter', ' '].includes(event.key)) { event.preventDefault(); event.stopPropagation(); release(); } });
  label.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); });
  window.addEventListener('blur', release);
  document.addEventListener('visibilitychange', () => { if (document.hidden) release(); });
  const fire = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  fire.setAttribute('d', 'M40 4C46 22 65 28 61 45C59 60 44 66 32 59C15 50 20 36 29 25C27 36 34 38 36 31C40 22 36 14 40 4Z');
  fire.setAttribute('fill', '#fff3ba'); fire.setAttribute('stroke', '#14120f'); fire.setAttribute('stroke-width', '4');
  el.querySelector('svg').appendChild(fire); el._fire = fire;
  el._rings = el.querySelectorAll('.goal-ground ellipse');
  // 行き先は旗つきの大きな輪。自分の短い足元印とは形を分ける。
  for (const ring of el._rings) { ring.setAttribute('rx', '36'); ring.setAttribute('ry', '12'); }
  // 目的の旗の布だけを囲む。枠は一つを使い回し、背景の旗には付けない。
  el._frame = document.createElement('div');
  el._frame.id = 'mission-flag-frame';
  el._frame.setAttribute('aria-hidden', 'true');
  el._frame.style.cssText = 'position:absolute;left:0;top:0;box-sizing:border-box;border:4px solid #fff;outline:3px solid #14120f;border-radius:3px;pointer-events:none;z-index:3';
  el._frame.hidden = true;
  const flag = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  flag.setAttribute('d', 'M32 65V5H65L56 18L65 31H32');
  flag.setAttribute('fill', '#fff3ba'); flag.setAttribute('stroke', '#14120f');
  flag.setAttribute('stroke-width', '4'); flag.setAttribute('stroke-linejoin', 'round');
  flag.setAttribute('class', 'goal-flag');
  el.querySelector('svg').appendChild(flag);
  const person = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  person.innerHTML = '<circle cx="40" cy="13" r="8" fill="#fff3ba" stroke="#14120f" stroke-width="3"/><path d="M26 48V34Q26 25 40 25Q54 25 54 34V48Z" fill="#fff3ba" stroke="#14120f" stroke-width="3"/>';
  el.querySelector('svg').appendChild(person); el._person = person;
  const shield = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  shield.setAttribute('d', 'M22 7H58V30Q58 45 40 55Q22 45 22 30ZM40 15V41M29 26H51');
  shield.setAttribute('fill', '#fff3ba'); shield.setAttribute('stroke', '#14120f'); shield.setAttribute('stroke-width', '4');
  el.querySelector('svg').appendChild(shield); el._shield = shield;
  // 実物の布にも、画面端と同じ旗印を付ける。作るのは一度だけ。
  const badge = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  badge.setAttribute('viewBox', '0 0 80 80');
  badge.style.cssText = 'position:absolute;width:56px;height:56px;left:50%;top:-56px;transform:translateX(-50%);overflow:visible';
  badge.appendChild(flag.cloneNode(true));
  el._frame.appendChild(badge);
  // 到着したピンは旗を確認の形へ替え、同じ場所の丸が満ちるまで残す。
  // 形は初回だけ作り、待ち時間の更新では属性だけ替える。
  const hold = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  hold.innerHTML = '<circle cx="40" cy="28" r="22" fill="#14120f" stroke="#fff3ba" stroke-width="3"/><path class="goal-progress" fill="#e8c25a"/><path d="M27 28L36 37L53 19" fill="none" stroke="#14120f" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/><path d="M27 28L36 37L53 19" fill="none" stroke="#fff3ba" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>';
  hold.style.display = 'none';
  el.querySelector('svg').appendChild(hold);
  el._hold = hold; el._progress = hold.querySelector('.goal-progress');
  el._checks = hold.querySelectorAll('path:not(.goal-progress)');
  const area = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  area.setAttribute('fill', 'none'); area.setAttribute('stroke', '#fff3ba');
  area.setAttribute('stroke-width', '3'); area.setAttribute('stroke-linejoin', 'round');
  area.style.filter = 'drop-shadow(0 0 2px #14120f)';
  area.style.display = 'none';
  el.querySelector('svg').prepend(area); el._area = area;
  el._areaPoints = Array.from({ length: 16 }, () => new THREE.Vector3());
  const follow = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  follow.setAttribute('d', 'M40 2L58 24L40 46L22 24Z');
  follow.setAttribute('fill', '#fff3ba'); follow.setAttribute('stroke', '#14120f'); follow.setAttribute('stroke-width', '5');
  el.querySelector('svg').appendChild(follow); el._follow = follow;
  const foot = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  foot.setAttribute('d', 'M12-5H42V-14L63 0L42 14V5H12Z');
  foot.setAttribute('fill', '#fff3ba'); foot.setAttribute('stroke', '#14120f'); foot.setAttribute('stroke-width', '5');
  foot.setAttribute('stroke-linejoin', 'round');
  el.querySelector('svg').appendChild(foot); el._foot = foot;
  const inside = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  inside.innerHTML = '<ellipse rx="16" ry="7" fill="#fff3ba" stroke="#14120f" stroke-width="4"/><path d="M-5-6V0M5-6V0" stroke="#14120f" stroke-width="4" stroke-linecap="round"/>';
  el.querySelector('svg').appendChild(inside); el._inside = inside;
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
    tmp.follow = true; tmp.fire = false; tmp.defend = false; tmp.footRing = false;
    tmp.waiting = false; tmp.arrived = false; tmp.area = false; tmp.r = 0;
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
  tmp.defend = m.guideDefend || m.guideArea === 'guard';
  tmp.defensePoint = m.guideDefensePoint;
  tmp.footRing = !!person && person.team === rt.player.u.team;
  // 火の印は家の戸口へ付ける。歩いて作業する位置とは分ける。
  const destination = tmp.fire ? g.pos : m.guideDestination?.() || g.pos;
  // 最終地点へ直進させず、戦が選んだ通れる戸口・曲がり角を共通のピンでも使う。
  const route = !person && !tmp.fire && m.id === 'next' && rt.def.routeGuidePriority?.(rt)
    ? rt.def.routeSignPoint?.(rt, destination) : null;
  const pos = route || destination;
  tmp.x = person ? person.pos.x : pos.x; tmp.z = person ? person.pos.z : pos.z;
  const reached = missionWaitReached(rt);
  tmp.waiting = reached !== null && !person;
  tmp.arrived = tmp.waiting && reached;
  tmp.area = false;
  tmp.turn = !!route && !!rt.def.routeTurnReady?.(rt, route);
  tmp.dirX = route?.dirX; tmp.dirZ = route?.dirZ;
  // 戸口や曲がり角は六歩手前で印を消さず、すぐそばまで案内する。
  tmp.r = tmp.turn ? .5 : m.guideRadius ?? (tmp.waiting ? 8 : m.entrance || m.id === 'next' ? 1 : 6);
  return tmp;
}

export function updateMissionPin(rt) {
  // 行き先の矢印は一本。画面外では方向と名前を同じ印に添える。
  rt.hud.missionPinLabelShown = false;
  rt.hud.missionPinOutside = false;
  if (pin) pin._frame.hidden = true;
  // 森部は描画面のピン一本で示す。旗と到着のチェックを同じ場所へ重ねない。
  if (rt.def.key === 'moribe') { if (pin) pin.hidden = true; return; }
  const want = pinGuideOn(rt) && !rt.over && !rt.choice && !rt.hud.introWaiting && rt.player?.u?.alive ? target(rt) : null;
  const closeEnemy = rt.missionGuide?.closeEnemy;
  // 手の届く敵との戦いを優先し、離れた行き先の矢印を同時に出さない。
  if (!want || !want.area && !want.fire && !want.footRing && !want.defend && closeEnemy?.alive && !closeEnemy.gone && !closeEnemy.fleeing &&
      Math.hypot(closeEnemy.pos.x - rt.player.u.pos.x, closeEnemy.pos.z - rt.player.u.pos.z) < 4.5 && !rt.holdPct) {
    if (pin) { if (pin._hud?.workHoldId === pin._work) pin._hud.workHoldId = null; pin.hidden = true; }
    return;
  }
  if (!pin) pin = make();
  const hud = rt.hud, root = hud.root;
  if (pin.parentNode !== root) root.appendChild(pin);
  if (pin._frame.parentNode !== root) root.appendChild(pin._frame);
  // 行き先が群れの真ん中だと毎コマ少しずつ動き、印が震える（kaito 10/23「グラグラ揺れる」）。
  //   遠くへ跳んだ時だけすぐ移し、ふだんは一メートル足らずの揺れを無視して、ゆっくり追わせる。地面の高さも同じ点で取る。
  const now = performance.now(), U = pinAt;
  const dt = Math.min(0.1, Math.max(0, (now - (U.at || now)) / 1000)); U.at = now;
  const me = rt.player.u.pos, key = rt.missionGuide?.key;
  const changed = U.rt !== rt || U.key !== key || U.unit !== want.unit;
  if (changed || Math.hypot(want.x - U.x, want.z - U.z) > 15) {
    U.x = want.x; U.z = want.z; U.rt = rt; U.key = key; U.unit = want.unit;
    U.y = groundAt(rt.world, U.x, U.z, me.y); U.ox = 0; U.oy = 0;
    U.out = undefined; U.outAt = 0; U.arrived = false; pin.hidden = false;
  }
  else if (Math.hypot(want.x - U.x, want.z - U.z) > 0.8) {
    const k = 1 - Math.exp(-dt * 1.5);
    U.x += (want.x - U.x) * k; U.z += (want.z - U.z) * k;
    U.y += (groundAt(rt.world, U.x, U.z, me.y) - U.y) * k;
  }
  // 到着範囲のあるピンは判定地点と一致させ、補間で古い場所へ誘わない。
  if (want.area || want.waiting || rt.def.routeGuidePriority?.(rt)) {
    U.x = want.x; U.z = want.z; U.y = groundAt(rt.world, U.x, U.z, me.y);
  }
  const d = Math.hypot(want.x - me.x, want.z - me.z);
  const near = want.fire || want.footRing || want.turn ? -2 : want.hide ?? (want.r ?? 6);
  const marker = rt.missionGuide?.marker;
  const waiting = want.waiting ?? (!want.unit && !!marker && (marker.waitAction || marker.waitGuide || /^(wait|guard)$/.test(marker.guideArea)));
  // 着いた・離れたの境で毎コマ出たり消えたりしない（チカチカ。kaito 10/23 稲生 27）。消えた後は一歩半離れてから出す。
  pin.hidden = !waiting && d <= near + (pin.hidden ? 1.5 : 0);
  if (pin.hidden) return;
  const W = VIEW.w, H = VIEW.h;
  // 仲間への合流は足元へ固定し、ほかの行き先と同じ旗と輪で示す。
  if (want.unit && want.footRing) goalPoint.set(want.unit.pos.x, want.unit.pos.y + .08, want.unit.pos.z);
  else if (want.unit) goalPoint.set(want.x, want.unit.pos.y + (want.unit.mounted ? 3.3 : 2.5), want.z);
  else goalPoint.set(U.x, U.y + (want.fire ? 2.5 : .08), U.z);
  // 柱・襖の向こうへ旗を貼らず、同じ行き先の方向矢印へ切り替える。
  const cp = rt.camera.position;
  if (changed || now >= (U.sightAt || 0) || Math.hypot(cp.x - U.cx, cp.y - U.cy, cp.z - U.cz) > .4) {
    U.sightAt = now + 200; U.cx = cp.x; U.cy = cp.y; U.cz = cp.z;
    U.occluded = cameraWallBlocked(rt, cp, goalPoint);
  }
  const occluded = U.occluded;
  const flagBounds = !want.area && !want.unit && !want.dodge && marker?.guideFlag && !occluded &&
    Math.hypot(want.x - rt.missionGuide.pos.x, want.z - rt.missionGuide.pos.z) < 1
    ? hud.goalFlagBounds(rt, marker, rt.missionGuide.pos) : null;
  goalPoint.project(rt.camera);
  if (!Number.isFinite(goalPoint.x) || !Number.isFinite(goalPoint.y)) { pin.hidden = true; return; }
  const behind = goalPoint.z < -1 || goalPoint.z > 1;
  // 稲生の相手が見えている間は頭上の赤い▼に任せる。
  // 大きなピンを幕や札の空き場所へずらし、別の物を指すように見せない。
  const inouEnemy = rt.def.key === 'inou' && want.unit && want.unit.team !== rt.player.u.team;
  if (inouEnemy && !behind && !occluded && Math.abs(goalPoint.x) < .94 && Math.abs(goalPoint.y) < .9) {
    pin.hidden = true;
    return;
  }
  let dx = goalPoint.x * (behind ? -1 : 1), dy = -goalPoint.y * (behind ? -1 : 1);
  const rects = hud.hudRects();
  let x = (dx + 1) * W / 2, y = (dy + 1) * H / 2;
  // 足元を別の場所へずらさず、札に隠れる時も端の矢印へ切り替える。
  //   画面の端・札の縁でも、前のコマと同じ形を少しの間は保つ（地面の旗と端の矢印が入れ替わり続けない）。
  let outside = behind || occluded || !goalFree(x, y, W, H, rects);
  if (!behind && !occluded && U.out !== undefined && outside !== U.out && now - (U.outAt || 0) < 400) outside = U.out;
  else if (outside !== U.out) { U.out = outside; U.outAt = now; }
  if (outside) {
    // 足元の投影は画面の下に出る。進む方向は地面上の向きから求め、前の目標へ下向きの矢印を出さない。
    rt.camera.getWorldDirection(goalDirection);
    const yaw = Math.atan2(goalDirection.x, goalDirection.z);
    const gx = want.x - me.x, gz = want.z - me.z;
    dx = -gx * Math.cos(yaw) + gz * Math.sin(yaw);
    dy = -(gx * Math.sin(yaw) + gz * Math.cos(yaw));
    const scale = Math.min((W / 2 - 92) / Math.max(Math.abs(dx), .001), (H / 2 - 92) / Math.max(Math.abs(dy), .001));
    x = W / 2 + dx * scale; y = H / 2 + dy * scale;
  }
  // 右上の札や操作面を避ける。空きが無ければ重ねず畳む。
  //   前のコマのずらしがまだ空いていれば、それを使い続ける（毎コマ選び直すと跳ねる）。
  if (!goalFree(x, y, W, H, rects) && (U.ox || U.oy) && goalFree(x + U.ox, y + U.oy, W, H, rects)) { x += U.ox; y += U.oy; }
  else if (goalFree(x, y, W, H, rects)) { U.ox = 0; U.oy = 0; }
  else {
    let found = false;
    for (let k = 1; k <= 30; k++) {
      const offset = Math.ceil(k / 2) * 18 * (k % 2 ? 1 : -1);
      if (goalFree(x, y + offset, W, H, rects)) { y += offset; U.ox = 0; U.oy = offset; found = true; break; }
      if (goalFree(x + offset, y, W, H, rects)) { x += offset; U.ox = offset; U.oy = 0; found = true; break; }
    }
    // 空きが無い時も消さず、前のコマの場所に残す（出たり消えたりさせない）。
    if (!found) { pin.hidden = true; return; }
  }
  pin.querySelector('.goal-ground').style.display = outside ? 'none' : '';
  const person = !!want.unit;
  const enemy = !!want.enemy || !!inouEnemy;
  if (pin._enemy !== enemy) {
    pin._enemy = enemy;
    for (const part of pin.querySelectorAll('.goal-ground path,.goal-edge,.goal-flag')) part.setAttribute('fill', enemy ? '#ff634d' : '#fff3ba');
  }
  const arrived = waiting ? (want.arrived ?? missionWaitReached(rt)) === true : !!want.arrived;
  if (arrived && !U.arrived) U.arrivalAt = rt.t;
  U.arrived = arrived;
  // 待つ場所と桶狭間の合流範囲は実寸で地面へ投影する。到着後も範囲を残す。
  const showArea = rt.def.key !== 'okehazama' && !outside && waiting;
  pin._area.style.display = showArea ? '' : 'none';
  pin._area.setAttribute('stroke-width', arrived ? '5' : '3');
  pin._area.setAttribute('stroke-dasharray', arrived ? '' : '10 7');
  if (showArea) {
    pin._area.setAttribute('stroke', arrived ? '#e4f2cb' : '#fff3ba');
    if (pin._areaRt !== rt || pin._areaX !== want.x || pin._areaZ !== want.z || pin._areaR !== want.r) {
      pin._areaRt = rt; pin._areaX = want.x; pin._areaZ = want.z; pin._areaR = want.r;
      for (let i = 0; i < pin._areaPoints.length; i++) {
        const a = i * Math.PI * 2 / pin._areaPoints.length;
        const ax = want.x + Math.cos(a) * want.r, az = want.z + Math.sin(a) * want.r;
        pin._areaPoints[i].set(ax, groundAt(rt.world, ax, az, me.y) + .08, az);
      }
    }
    // 手前側が視点の後ろに出ても、見える側の境界まで消さない。
    let path = '', connected = false, complete = true;
    for (let i = 0; i <= pin._areaPoints.length; i++) {
      areaPoint.copy(pin._areaPoints[i % pin._areaPoints.length]).project(rt.camera);
      if (areaPoint.z < -1 || areaPoint.z > 1) { connected = false; complete = false; continue; }
      path += `${connected ? 'L' : 'M'}${((areaPoint.x + 1) * W / 2 - x + 40).toFixed(1)} ${((1 - areaPoint.y) * H / 2 - y + 68).toFixed(1)}`;
      connected = true;
    }
    pin._area.setAttribute('d', path + (complete ? 'Z' : ''));
    pin._area.setAttribute('fill', complete ? arrived ? '#e4f2cb18' : '#fff3ba18' : 'none');
  }
  pin.querySelector('.goal-ground path').style.display = !arrived && (want.dodge || want.defend) ? '' : 'none';
  const flag = pin.querySelector('.goal-flag');
  // 桶狭間は地面に刺さる一点を示す。固定の小さな輪を到着範囲に見せない。
  const oke = rt.def.key === 'okehazama';
  if (pin._oke !== oke) {
    pin._oke = oke;
    flag.setAttribute('d', oke ? 'M40 68L25 38C5 9 75 9 55 38Z M40 20A6 6 0 1 0 40 32A6 6 0 1 0 40 20Z' : 'M32 65V5H65L56 18L65 31H32');
    flag.setAttribute('fill-rule', 'evenodd');
  }
  const showHold = arrived && (!person || want.footRing) && !want.defend && !outside;
  flag.style.display = (person && !(oke && want.footRing)) || want.defend || inouEnemy || want.fire || want.dodge || showHold ? 'none' : '';
  pin._person.style.display = person && !(oke && want.footRing) && !want.follow && !enemy && !showHold ? '' : 'none';
  pin._follow.style.display = want.follow ? '' : 'none';
  pin._follow.setAttribute('transform', outside ? 'translate(10,-24) scale(.75)' : '');
  pin._person.setAttribute('transform', outside ? 'translate(10,-24) scale(.75)' : '');
  pin._shield.style.display = want.defend ? '' : 'none';
  pin._shield.setAttribute('transform', outside ? 'translate(10,-24) scale(.75)' : '');
  // 盾は守る柵、輪と下向きの矢印は立つ床へ。柵の向こう側へ誘わない。
  if (want.defend && want.defensePoint && !outside) {
    const post = want.defensePoint;
    goalPoint.set(post.x, groundAt(rt.world, post.x, post.z, me.y) + 1.5, post.z).project(rt.camera);
    const sx = (goalPoint.x + 1) * W / 2, sy = (1 - goalPoint.y) * H / 2;
    if (goalPoint.z < -1 || goalPoint.z > 1 || !goalFree(sx, sy, W, H, rects)) pin._shield.style.display = 'none';
    else pin._shield.setAttribute('transform', `translate(${(sx - x).toFixed(1)},${(sy - y + 13).toFixed(1)})`);
  }
  pin._hold.style.display = showHold ? '' : 'none';
  if (arrived) {
    const progress = Number.isFinite(want.progress) ? Math.max(0, Math.min(1, want.progress)) : 0;
    // 合流の瞬間だけ確認の形にし、その後は満ちる丸を合図まで見せる。
    for (const check of pin._checks)
      check.style.display = rt.def.key === 'okehazama' && Number.isFinite(want.progress) && progress < 1 && rt.t - U.arrivalAt >= .8 ? 'none' : '';
    // 満ち切る直前まで扇形。完了は円にして合図の時刻とそろえる。
    const angle = Math.PI * 2 * Math.min(progress, .9999);
    pin._progress.setAttribute('d', progress >= 1
      ? 'M40 8A20 20 0 1 1 40 48A20 20 0 1 1 40 8'
      : progress > 0 ? `M40 28L40 8A20 20 0 ${progress > .5 ? 1 : 0} 1 ${40 + Math.sin(angle) * 20} ${28 - Math.cos(angle) * 20}Z` : '');
  }
  // 端では同じ旗を矢印の上へ置き、見えている時は目的の人や床に竿を合わせる。
  flag.setAttribute('transform', oke ? outside ? 'translate(0,-24) scale(.75)' : '' : outside ? 'translate(0,-24)' : 'translate(-8,-16) scale(1.25)');
  // 帰る旗までの向きは、自分の足元から短い一本で示す。
  const showFoot = !oke && !arrived && !person && !want.fire && !want.dodge &&
    (waiting || marker?.guideFlag) && d > (want.r ?? 6);
  pin._foot.style.display = 'none'; pin._inside.style.display = 'none';
  if (showFoot || arrived && waiting && !outside) {
    playerPoint.set(me.x, me.y + .1, me.z).project(rt.camera);
    const px = (playerPoint.x + 1) * W / 2, py = (1 - playerPoint.y) * H / 2;
    if (playerPoint.z >= -1 && playerPoint.z <= 1 && px > 72 && px < W - 72 && py > 80 && py < H - 28) {
      const fx = px - x + 40, fy = py - y + (outside ? 40 : 68);
      if (showFoot) {
        rt.camera.getWorldDirection(goalDirection);
        const yaw = Math.atan2(goalDirection.x, goalDirection.z);
        const gx = want.x - me.x, gz = want.z - me.z;
        const right = -gx * Math.cos(yaw) + gz * Math.sin(yaw);
        const forward = gx * Math.sin(yaw) + gz * Math.cos(yaw);
        pin._foot.setAttribute('transform', `translate(${fx},${fy - 16}) rotate(${Math.atan2(-forward, right) * 180 / Math.PI})`);
        pin._foot.style.display = '';
      } else {
        pin._inside.setAttribute('transform', `translate(${fx},${fy})`);
        pin._inside.style.display = '';
      }
    }
  }
  // 桶狭間は実寸の合流範囲、ほかの戦は足元の輪で示す。回避の矢印には重ねない。
  const groundRing = !oke && (!person || want.footRing) && !want.dodge;
  if (pin._groundRing !== groundRing) {
    pin._groundRing = groundRing;
    for (const ring of pin._rings) ring.style.display = groundRing ? '' : 'none';
  }
  const arrow = pin.querySelector('.goal-edge');
  const turn = want.turn && !outside;
  arrow.style.display = outside || turn ? '' : 'none';
  if (turn) {
    rt.camera.getWorldDirection(goalDirection);
    const yaw = Math.atan2(goalDirection.x, goalDirection.z);
    dx = -want.dirX * Math.cos(yaw) + want.dirZ * Math.sin(yaw);
    dy = -(want.dirX * Math.sin(yaw) + want.dirZ * Math.cos(yaw));
    flag.style.display = 'none';
  }
  // 敵を追う端の印も赤い▼。旗の下の味方を目的地に見せない。
  const enemyEdge = !!inouEnemy;
  if (pin._enemyEdge !== enemyEdge) {
    pin._enemyEdge = enemyEdge;
    arrow.setAttribute('d', enemyEdge ? 'M24 26H56L40 54Z' : 'M12 31H43V17L69 40L43 63V49H12Z');
  }
  arrow.style.transform = `rotate(${Math.atan2(dy, dx) - (enemyEdge ? Math.PI / 2 : 0)}rad)`;
  hud.missionPinOutside = outside;
  if (flagBounds && flagBounds.left >= 8 && flagBounds.top >= 48 &&
      flagBounds.left + flagBounds.width <= W - 8 && flagBounds.top + flagBounds.height <= H - 8 &&
      !rects.some(r => flagBounds.left < r.right && flagBounds.left + flagBounds.width > r.left &&
        flagBounds.top - 40 < r.bottom && flagBounds.top + flagBounds.height > r.top)) {
    const frame = pin._frame;
    frame.hidden = false;
    frame.style.width = `${flagBounds.width.toFixed(1)}px`;
    frame.style.height = `${flagBounds.height.toFixed(1)}px`;
    frame.style.transform = `translate(${flagBounds.left.toFixed(1)}px,${flagBounds.top.toFixed(1)}px)`;
  }
  pin._fire.style.display = want.fire ? '' : 'none';
  pin._fire.setAttribute('transform', outside ? 'translate(8,-22) scale(.65)' : '');
  const action = want.fire ? rt.nearestInteract() : null;
  const working = !!action?.hold && /火/.test(action.label) && action.id === marker?.id;
  const label = pin._label;
  const text = rt.def.key === 'inou' || rt.def.key === 'okehazama' ? '' : want.fire ? working ? '火をつける（長押し）' : rt.G.lord ? '足軽が火をつける家' : '火の家へ' : '';
  if (pin._words.textContent !== text) pin._words.textContent = text;
  pin.classList.toggle('fire-action', working);
  const progress = working && rt.holdId === action.id ? Math.round(Math.max(0, Math.min(1, rt.holdPct || 0)) * 100) : 0;
  pin._workProgress.hidden = !working;
  if (pin._workProgress.getAttribute('aria-valuenow') !== String(progress)) {
    pin._workProgress.setAttribute('aria-valuenow', progress);
    label.style.setProperty('--fire-progress', `${progress}%`);
  }
  label.hidden = !text;
  // 短い案内を端で切らず、同じ印の幅の中へ収める。
  label.style.maxWidth = '220px'; label.style.whiteSpace = 'normal';
  label.style.left = `${40 + Math.max(116 - x, Math.min(W - 116 - x, 0))}px`;
  label.style.top = outside ? '72px' : '60px';
  label.style.pointerEvents = working ? 'auto' : 'none';
  label.style.minHeight = working ? '44px' : '0';
  label.style.width = working ? '208px' : 'max-content';
  label.style.border = working ? '2px solid #fff3ba' : '0';
  label.style.padding = working ? '8px 12px 14px' : '4px 8px';
  label.style.background = working ? '#29251c' : '#14120f';
  label.tabIndex = working ? 0 : -1;
  if (pin._work && pin._work !== (working ? action.id : null) && hud.workHoldId === pin._work) hud.workHoldId = null;
  pin._work = working ? action.id : null; pin._hud = hud; pin._rt = rt;
  hud.missionPinLabelShown = !!text;
  // 丸めず小数一桁で置き、地面に固定する。
  pin.style.transform = `translate(${(x - 40).toFixed(1)}px,${(y - (outside ? 40 : 68)).toFixed(1)}px)`;
}
const areaPoint = new THREE.Vector3();
const playerPoint = new THREE.Vector3();
const goalPoint = new THREE.Vector3();
const goalDirection = new THREE.Vector3();
const pinAt = { x: 0, z: 0, y: 0, ox: 0, oy: 0, at: 0, rt: null };
function goalFree(x, y, W, H, rects) {
  // 輪と旗は八十画素。実寸と余白だけを避け、携帯横でも案内を畳まない。
  if (x < 52 || x > W - 52 || y < 80 || y > H - 68) return false;
  for (const r of rects) if (x + 48 >= r.left && x - 48 <= r.right && y + 64 >= r.top && y - 76 <= r.bottom) return false;
  return true;
}
