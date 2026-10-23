// 行き先は旗。画面外では端の方向矢印に同じ旗を添える。
//   戦の定義の missionPin(rt) が { x, z, r } を返す間だけ立てる（r＝着いたとみなす半径。定義の判定と同じ値を返す）。
//   待つ場所は着いても残す。印と投影用の点は一つを使い回す。
import * as THREE from 'three';
import { VIEW } from './viewport.js';
import { currentObjective, missionWaitReached, missionFollowTarget } from './mission_guide.js';
import { groundAt } from './floors.js';
import { cameraWallBlocked, inouSignVisible } from './battle_sight.js';

let pin = null;
function make() {
  const el = document.createElement('div');
  el.id = 'mission-goal';
  el.innerHTML = '<svg width="80" height="80" viewBox="0 0 80 80" aria-hidden="true"><g class="goal-ground" stroke-linejoin="round"><ellipse cx="40" cy="68" rx="30" ry="9" fill="none" stroke="#14120f" stroke-width="10"/><ellipse cx="40" cy="68" rx="30" ry="9" fill="none" stroke="#fff3ba" stroke-width="5"/><path d="M32 8H48V37H61L40 59L19 37H32Z" fill="#fff3ba" stroke="#14120f" stroke-width="4"/></g><path class="goal-edge" d="M12 31H43V17L69 40L43 63V49H12Z" fill="#fff3ba" stroke="#14120f" stroke-width="4" stroke-linejoin="round" style="display:none;transform-origin:40px 40px"/></svg>';
  el.style.cssText = 'position:absolute;left:0;top:0;width:80px;height:80px;pointer-events:none;z-index:3';
  const style = document.createElement('style');
  style.textContent = '#hud.photo :is(#mission-goal,#mission-flag-frame,#mission-target-lines),#hud.ending :is(#mission-goal,#mission-flag-frame,#mission-target-lines),#hud:has(#bigmap:not([hidden])) :is(#mission-goal,#mission-flag-frame,#mission-target-lines),#hud:has(#cine.on) :is(#mission-goal,#mission-flag-frame,#mission-target-lines){display:none}' +
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
  person.innerHTML = '<circle cx="40" cy="13" r="8" fill="#fff3ba" stroke="#14120f" stroke-width="3"/><path d="M26 48V34Q26 25 40 25Q54 25 54 34V48Z" fill="#fff3ba" stroke="#14120f" stroke-width="3"/>';
  el.querySelector('svg').appendChild(person); el._person = person;
  const shield = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  shield.setAttribute('d', 'M22 7H58V30Q58 45 40 55Q22 45 22 30ZM40 15V41M29 26H51');
  shield.setAttribute('fill', '#fff3ba'); shield.setAttribute('stroke', '#14120f'); shield.setAttribute('stroke-width', '4');
  el.querySelector('svg').appendChild(shield); el._shield = shield;
  // 到着は完了ではない。待つ間は砂時計を残し、次の任務で印を切り替える。
  // 形は初回だけ作り、待ち時間の更新では属性だけ替える。
  const hold = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  hold.innerHTML = '<circle cx="40" cy="28" r="22" fill="#14120f" stroke="#fff3ba" stroke-width="3"/><path class="goal-progress" fill="#e8c25a"/><path d="M30 14H50V20L40 28L50 36V42H30V36L40 28L30 20ZM28 14H52M28 42H52" fill="none" stroke="#14120f" stroke-width="9" stroke-linejoin="round"/><path d="M30 14H50V20L40 28L50 36V42H30V36L40 28L30 20ZM28 14H52M28 42H52" fill="none" stroke="#fff3ba" stroke-width="4" stroke-linejoin="round"/>';
  hold.style.display = 'none';
  el.querySelector('svg').appendChild(hold);
  el._hold = hold; el._progress = hold.querySelector('.goal-progress');
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
  tmp.gate = m.guideSymbol === 'gate';
  tmp.defend = m.guideDefend || m.guideArea === 'guard';
  tmp.defensePoint = m.guideDefensePoint;
  tmp.footRing = !!person && person.team === rt.player.u.team;
  // 火付けの到着点も、実際に作業できる戸口の足場にそろえる。
  const destination = m.guideDestination?.() || g.pos;
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
  tmp.r = route ? .5 : rt.def.defendGuideRadius?.(rt, m) ?? m.guideRadius ?? (tmp.waiting ? 8 : m.entrance || m.id === 'next' ? 1 : 6);
  return tmp;
}

export function updateMissionPin(rt) {
  // 行き先の矢印は一本。画面外では方向と名前を同じ印に添える。
  updatePlayerFoot(rt);
  rt.hud.missionPinLabelShown = false;
  rt.hud.missionPinOutside = false;
  if (pin) pin._lines.style.display = 'none';
  // 森部は描画面のピン一本で示す。旗と到着のチェックを同じ場所へ重ねない。
  if (rt.def.key === 'moribe') { if (pin) pin.hidden = true; return; }
  const want = pinGuideOn(rt) && !rt.over && !rt.choice && !rt.hud.introWaiting && rt.player?.u?.alive ? target(rt) : null;
  const closeEnemy = rt.missionGuide?.closeEnemy;
  // 手の届く敵との戦いを優先し、離れた行き先の矢印を同時に出さない。
  if (!want || !rt.def.routeGuidePriority?.(rt) && !want.area && !want.waiting && !want.fire && !want.gate && !want.footRing && !want.defend && closeEnemy?.alive && !closeEnemy.gone && !closeEnemy.fleeing &&
      Math.hypot(closeEnemy.pos.x - rt.player.u.pos.x, closeEnemy.pos.z - rt.player.u.pos.z) < 4.5 && !rt.holdPct) {
    if (pin) { if (pin._hud?.workHoldId === pin._work) pin._hud.workHoldId = null; pin.hidden = true; }
    return;
  }
  if (!pin) pin = make();
  const hud = rt.hud, root = hud.root;
  if (pin.parentNode !== root) root.appendChild(pin);
  if (pin._lines.parentNode !== root) root.appendChild(pin._lines);
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
  if (want.unit || want.area || want.waiting || want.fire || want.gate || rt.def.routeGuidePriority?.(rt)) {
    U.x = want.x; U.z = want.z; U.y = groundAt(rt.world, U.x, U.z, me.y);
  }
  const d = Math.hypot(want.x - me.x, want.z - me.z);
  const near = want.fire || want.gate || want.footRing || want.turn ? -2 : want.hide ?? (want.r ?? 6);
  const marker = rt.missionGuide?.marker;
  const waiting = want.waiting ?? (!want.unit && !!marker && (marker.waitAction || marker.waitGuide || /^(wait|guard)$/.test(marker.guideArea)));
  const arrived = waiting ? (want.arrived ?? missionWaitReached(rt)) === true : !!want.arrived;
  // 着いた・離れたの境で毎コマ出たり消えたりしない（チカチカ。kaito 10/23 稲生 27）。消えた後は一歩半離れてから出す。
  pin.hidden = !waiting && d <= near + (pin.hidden ? 1.5 : 0);
  if (pin.hidden) return;
  const W = VIEW.w, H = VIEW.h;
  const inouEnemy = rt.def.key === 'inou' && want.unit && want.unit.team !== rt.player.u.team;
  const enemyVisible = inouEnemy && inouSignVisible(rt, want.unit);
  // 人は頭上のひし形、自分は足元の輪。離れても同じ形で追えるようにする。
  const groundPerson = rt.def.key === 'okehazama' && want.unit && (want.footRing || want.follow);
  if (inouEnemy && !enemyVisible) goalPoint.set(want.x, want.unit.pos.y + .08, want.z);
  else if (groundPerson) goalPoint.set(U.x, U.y + .08, U.z);
  else if (want.unit) goalPoint.set(want.unit.pos.x, want.unit.pos.y + (want.unit.mounted ? 3.3 : 2.1), want.unit.pos.z);
  else if (want.fire && marker?.entrance && rt.missionGuide?.pos) {
    // 通れる足場と戸口を分け、火の印は家の戸口そのものに置く。
    const door = marker.pos();
    if (!door) { pin.hidden = true; return; }
    goalPoint.set(door.x, (door.y ?? groundAt(rt.world, door.x, door.z, me.y)) + 1.9, door.z);
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
  // 稲生の相手が見えている間は頭上の赤い▼に任せる。
  // 大きなピンを幕や札の空き場所へずらし、別の物を指すように見せない。
  if (enemyVisible && !behind && !occluded && Math.abs(goalPoint.x) < .94 && Math.abs(goalPoint.y) < .9) {
    pin.hidden = true;
    return;
  }
  let dx = goalPoint.x * (behind ? -1 : 1), dy = -goalPoint.y * (behind ? -1 : 1);
  const rects = hud.hudRects();
  let x = (dx + 1) * W / 2, y = (dy + 1) * H / 2;
  // 足元を別の場所へずらさず、札に隠れる時も端の矢印へ切り替える。
  //   画面の端・札の縁でも、前のコマと同じ形を少しの間は保つ（地面の旗と端の矢印が入れ替わり続けない）。
  // 人と戸口の印は実物へ固定する。札避けで別の人や空き地へ動かさない。
  const anchored = !!want.unit || !!want.fire || !!want.gate || !!rt.def.routeGuidePriority?.(rt);
  const inFrame = x >= 32 && x <= W - 32 && y >= 76 && y <= H - 24;
  let outside = behind || occluded || (anchored ? !inFrame : !goalFree(x, y, W, H, rects));
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
    x = W / 2 + dx * scale; y = H / 2 + dy * scale;
  }
  // 右上の札や操作面を避ける。空きが無ければ重ねず畳む。
  //   前のコマのずらしがまだ空いていれば、それを使い続ける（毎コマ選び直すと跳ねる）。
  if (anchored && !outside) { U.ox = 0; U.oy = 0; }
  else if (!goalFree(x, y, W, H, rects) && (U.ox || U.oy) && goalFree(x + U.ox, y + U.oy, W, H, rects)) { x += U.ox; y += U.oy; }
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
  const enemy = !inouEnemy && !!want.enemy;
  if (pin._enemy !== enemy) {
    pin._enemy = enemy;
    for (const part of pin.querySelectorAll('.goal-ground path,.goal-edge,.goal-flag')) part.setAttribute('fill', enemy ? '#ff634d' : '#fff3ba');
  }
  if (arrived && !U.arrived) U.arrivalAt = rt.t;
  U.arrived = arrived;
  // 大きな守備輪は描かず、明示された任務範囲だけを残す。
  const showArea = rt.def.key !== 'okehazama' && !!want.area;
  pin._area.style.display = showArea ? '' : 'none';
  pin._area.setAttribute('stroke-width', arrived ? '5' : '3');
  pin._area.setAttribute('stroke-dasharray', arrived || want.defend ? '' : '10 7');
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
      path += `${connected ? 'L' : 'M'}${((areaPoint.x + 1) * W / 2 - x + 40).toFixed(1)} ${((1 - areaPoint.y) * H / 2 - y + (outside ? 40 : 68)).toFixed(1)}`;
      connected = true;
    }
    pin._area.setAttribute('d', path + (complete ? 'Z' : ''));
    pin._area.setAttribute('fill', 'none');
  }
  // 桶狭間はピンの先端を到着判定の地面に刺す。兵の頭上を指す矢印に替えない。
  const flagDestination = !person && !enemy && !want.fire && !want.gate && !want.dodge && !want.turn && !want.defensePoint;
  // 通る入口にも矢印を残し、人・敵・守る対象の印とは重ねない。
  const destinationArrow = rt.def.key !== 'okehazama' && (flagDestination || want.gate) && !arrived && !outside && !want.follow && !want.enemy && !want.defend;
  // 小旗の横に短い矢印を置き、同じ行き先の足場だけを指す。
  pin.querySelector('.goal-ground path').setAttribute('d', 'M35 40H45V53H52L40 68L28 53H35Z');
  pin.querySelector('.goal-ground path').style.display = destinationArrow ? '' : 'none';
  const flag = pin.querySelector('.goal-flag');
  // 桶狭間は地面に刺さる一点を示す。固定の小さな輪を到着範囲に見せない。
  const oke = rt.def.key === 'okehazama';
  const groundPin = oke || inouEnemy;
  if (pin._groundPin !== groundPin) {
    pin._groundPin = groundPin;
    flag.setAttribute('d', groundPin ? 'M40 68L25 38C5 9 75 9 55 38Z M40 20A6 6 0 1 0 40 32A6 6 0 1 0 40 20Z' : 'M32 65V5H65L56 18L65 31H32');
    flag.setAttribute('fill-rule', 'evenodd');
  }
  const showHold = arrived && (!person || want.footRing) && !want.defend && (!outside || oke) && (!flagDestination || oke);
  flag.style.display = destinationArrow || (person && !groundPerson) || want.defend || inouEnemy || want.fire || want.gate || want.dodge || showHold && !oke ? 'none' : '';
  if (flagDestination && !oke) flag.style.display = '';
  // 赤い▼は兵の頭上だけ。見失った時は同じ相手の足元へ金のピン一本を置く。
  if (inouEnemy) flag.style.display = '';
  const friendlyPerson = person && !oke && !enemy && (want.follow || want.footRing);
  pin._person.style.display = person && !destinationArrow && !groundPerson && !friendlyPerson && !enemy && !showHold ? '' : 'none';
  if (inouEnemy) pin._person.style.display = 'none';
  pin._follow.style.display = friendlyPerson && !destinationArrow ? '' : 'none';
  pin._follow.setAttribute('transform', outside ? 'translate(10,-24) scale(.75)' : 'translate(14,38) scale(.65)');
  pin._gate.style.display = want.gate && !destinationArrow ? '' : 'none';
  pin._gate.setAttribute('transform', outside ? 'translate(10,-24) scale(.75)' : '');
  pin._person.setAttribute('transform', outside ? 'translate(10,-24) scale(.75)' : '');
  pin._shield.style.display = want.defend && !flagDestination ? '' : 'none';
  pin._shield.setAttribute('transform', outside ? 'translate(10,-24) scale(.75)' : '');
  // 盾の下端を実物の上辺に合わせる。空き地への下向き矢印は重ねない。
  if (want.defend && want.defensePoint && !outside) pin._shield.setAttribute('transform', 'translate(0,13)');
  pin._hold.style.display = showHold ? '' : 'none';
  // 桶狭間は到着しても同じピンを残し、その穴の中だけで待ちの進みを示す。
  // 別の時計へ替えず、待つ場所と満ち切る合図を一つにする。
  if (pin._holdOke !== oke) {
    pin._holdOke = oke;
    pin._hold.children[2].style.display = oke ? 'none' : '';
    pin._hold.children[3].style.display = oke ? 'none' : '';
  }
  if (arrived) {
    const progress = Number.isFinite(want.progress) ? Math.max(0, Math.min(1, want.progress)) : 0;
    // 進み具合が不明でも砂時計を出し、完了を思わせる印にはしない。
    // 満ち切る直前まで扇形。完了は円にして合図の時刻とそろえる。
    const angle = Math.PI * 2 * Math.min(progress, .9999);
    pin._progress.setAttribute('d', progress >= 1
      ? 'M40 8A20 20 0 1 1 40 48A20 20 0 1 1 40 8'
      : progress > 0 ? `M40 28L40 8A20 20 0 ${progress > .5 ? 1 : 0} 1 ${40 + Math.sin(angle) * 20} ${28 - Math.cos(angle) * 20}Z` : '');
  }
  // 端では同じ旗を矢印の上へ置き、見えている時は目的の人や床に竿を合わせる。
  const edgeFlag = outside && !arrived && !person && !enemy && !want.fire && !want.dodge;
  if (edgeFlag) flag.style.display = '';
  flag.setAttribute('transform', outside ? edgeFlag ? 'translate(14,-34) scale(.65)' :
    groundPin ? 'translate(0,-24) scale(.75)' : 'translate(0,-24)' : groundPin ? '' : 'translate(16,19.25) scale(.75)');
  pin._hold.setAttribute('transform', oke ? `${flag.getAttribute('transform')} translate(22,13.4) scale(.45)` : '');
  // 方向は端の旗一本へまとめ、自分の足元には輪だけを残す。
  // 行き先の輪は足さず、自分の水色の足元印と役割を分ける。
  const groundRing = false;
  if (pin._groundRing !== groundRing) {
    pin._groundRing = groundRing;
    for (const ring of pin._rings) ring.style.display = groundRing ? '' : 'none';
  }
  const arrow = pin.querySelector('.goal-edge');
  const turn = want.turn && !outside;
  arrow.style.display = !inouEnemy && !arrived && (outside || turn) ? '' : 'none';
  if (edgeFlag) pin._shield.style.display = 'none';
  if (arrived && outside) { if (!oke) flag.style.display = 'none'; pin._shield.style.display = 'none'; }
  if (turn) {
    rt.camera.getWorldDirection(goalDirection);
    const yaw = Math.atan2(goalDirection.x, goalDirection.z);
    dx = -want.dirX * Math.cos(yaw) + want.dirZ * Math.sin(yaw);
    dy = -(want.dirX * Math.sin(yaw) + want.dirZ * Math.cos(yaw));
    flag.style.display = 'none';
  }
  arrow.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
  hud.missionPinOutside = outside;
  pin._fire.style.display = want.fire ? '' : 'none';
  pin._fire.setAttribute('transform', outside ? 'translate(8,-22) scale(.65)' : '');
  const action = want.fire ? rt.nearestInteract() : null;
  const working = !!action?.hold && /火/.test(action.label) && action.id === marker?.id;
  const label = pin._label;
  // 守備の案内は右上の任務札へまとめる。
  const text = friendlyPerson ? 'この人' :
    want.fire && !marker?.guideAttack ? rt.G.lord ? '足軽が火をつける家' : 'ここで火をつける' : '';
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
  label.style.top = outside ? '72px' : friendlyPerson ? '-6px' : '88px';
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
  label.style.minHeight = working ? '44px' : '0';
  label.style.width = working ? '208px' : 'max-content';
  label.style.border = working ? '2px solid #fff3ba' : '0';
  label.style.padding = working ? '8px 12px 14px' : '4px 8px';
  label.style.background = working ? '#29251c' : '#14120f';
  label.tabIndex = working ? 0 : -1;
  if (pin._work && pin._work !== (working ? action.id : null) && hud.workHoldId === pin._work) hud.workHoldId = null;
  pin._work = working ? action.id : null; pin._hud = hud; pin._rt = rt;
  hud.missionPinLabelShown = !!text;
  // 人を示す任務札から同じ足元へ一本だけつなぐ。札は増やさない。
  let linkPath = '', outlinePath = '';
  const order = hud.guideOrderRect;
  if (person && want.footRing && order) {
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
  // 火の印と太い縁を同じ戸口へ固定する。足場や兵の位置へ移さない。
  if (want.fire && marker?.entrance && !outside) {
    const door = marker.pos(), approach = marker.guideDestination?.();
    if (door && approach) {
      const vx = approach.x - door.x, vz = approach.z - door.z;
      const length = Math.hypot(vx, vz) || 1;
      const base = door.y ?? groundAt(rt.world, door.x, door.z, me.y);
      for (let i = 0; i < 4; i++) {
        const side = i === 0 || i === 3 ? -.75 : .75;
        areaPoint.set(door.x + vz / length * side, base + (i < 2 ? 1.9 : 0), door.z - vx / length * side).project(rt.camera);
        if (areaPoint.z < -1 || areaPoint.z > 1) { outlinePath = ''; break; }
        outlinePath += `${i ? 'L' : 'M'}${((areaPoint.x + 1) * W / 2).toFixed(1)} ${((1 - areaPoint.y) * H / 2).toFixed(1)}`;
      }
      if (outlinePath) outlinePath += 'Z';
    }
  }
  // 頭上と足元に同じひし形を付け、旗持ちの兵にも紛れないようにする。
  let badgePath = '';
  if (friendlyPerson && !outside) {
    areaPoint.set(want.unit.pos.x, want.unit.pos.y + .08, want.unit.pos.z).project(rt.camera);
    if (areaPoint.z >= -1 && areaPoint.z <= 1) {
      const bx = (areaPoint.x + 1) * W / 2, by = (1 - areaPoint.y) * H / 2;
      badgePath = `M${bx} ${by - 8}L${bx + 16} ${by}L${bx} ${by + 8}L${bx - 16} ${by}Z`;
    }
  }
  pin._targetBadge.setAttribute('d', badgePath);
  for (const path of pin._links) path.setAttribute('d', linkPath);
  for (const path of pin._outlines) path.setAttribute('d', outlinePath);
  pin._lines.style.display = linkPath || outlinePath || badgePath ? '' : 'none';
  // 丸めず小数一桁で置き、地面に固定する。
  pin.style.transform = `translate(${(x - 40).toFixed(1)}px,${(y - (outside ? 40 : 68)).toFixed(1)}px)`;
}
// 自分の印は足元の水色の輪一つ。行き先の小旗と形でも見分ける。
let playerFoot = null;
function updatePlayerFoot(rt) {
  const active = pinGuideOn(rt) && rt.def.key !== 'moribe' && rt.def.key !== 'okehazama' && rt.def.key !== 'inou' && !rt.over && !rt.choice && !rt.hud.introWaiting &&
    rt.player?.u?.alive && !rt.player.camShot && !rt.hud.bigmap;
  if (!active) {
    if (playerFoot) playerFoot.hidden = true;
    return;
  }
  if (!playerFoot) {
    playerFoot = document.createElement('div');
    playerFoot.id = 'mission-player-foot';
    playerFoot.setAttribute('aria-hidden', 'true');
    playerFoot.style.cssText = 'position:absolute;width:48px;height:24px;pointer-events:none;z-index:3';
    playerFoot.innerHTML = '<svg width="48" height="24" viewBox="0 0 48 24"><ellipse cx="24" cy="12" rx="19" ry="7" fill="none" stroke="#14120f" stroke-width="8"/><ellipse cx="24" cy="12" rx="19" ry="7" fill="none" stroke="#bdefff" stroke-width="4"/></svg>';
  }
  if (playerFoot.parentNode !== rt.hud.root) rt.hud.root.appendChild(playerFoot);
  const u = rt.player.u, p = u.pos;
  const hidden = rt.hud.root.classList.contains('photo') || rt.hud.root.classList.contains('ending') ||
    !!rt.hud.root.querySelector('#cine.on');
  playerPoint.set(p.x, p.y + .1, p.z).project(rt.camera);
  const x = (playerPoint.x + 1) * VIEW.w / 2, y = (1 - playerPoint.y) * VIEW.h / 2;
  playerFoot.hidden = hidden || rt.def.key === 'okehazama' || playerPoint.z < -1 || playerPoint.z > 1 ||
    x < 0 || x > VIEW.w || y < 0 || y > VIEW.h;
  if (playerFoot.hidden) return;
  playerFoot.style.transform = `translate(${(x - 24).toFixed(1)}px,${(y - 12).toFixed(1)}px)`;
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
