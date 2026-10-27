// 任務の行き先と目当ての敵を決める所（mission_pin.js から分けた。中身は同じ。描くのは mission_pin.js）
//   target(rt)：今の行き先 { x, z, r, unit, ... }。markedEnemy(rt)：戦が指した相手。updateEnemyTarget：目当ての一人の白ふちの▼
import { VIEW, safeInsets } from './viewport.js';
import { currentObjective, missionWaitReached, missionFollowTarget } from './mission_guide.js';
import { cameraWallBlocked, inouSignVisible, inouSignHeight } from './battle_sight.js';
import * as THREE from 'three';
import { weatherSight, weatherSees } from './weather_gameplay.js';
// 行き先の点と向き（描く側 mission_pin.js と使い回す）
export const goalPoint = new THREE.Vector3();
export const goalDirection = new THREE.Vector3();

export const pinGuideOn = (rt) => !!rt && !rt.def.town && !rt.def.dojo;

const tmp = { x: 0, z: 0, r: 6 };
export function missionTarget(rt) { return target(rt); }
export function target(rt) {
  if (rt.def.missionPin) { const own = rt.def.missionPin(rt); if (own !== undefined || !rt.def.missionPinFallback) return own; }
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
export function updateEnemyTarget(rt, allowed = true) {
  const hud = rt.hud, me = rt.player?.u;
  hud.missionEnemyShown = false;
  hud.enemySignOffscreen = false;
  if (enemyTarget) enemyTarget.hidden = true;
  // 森部は本人の赤い▼で間合い・命中を返す。固定の大きな▼と「敵」の札で覆わない。
  if (rt.def.missionStyle === 'ford') { rt.army.missionMarkedEnemy = null; return false; }
  const active = allowed && pinGuideOn(rt) && me?.alive && !rt.over && !rt.choice && !hud.introWaiting &&
    !rt.player.camShot && !hud.bigmap && !hud.root.classList.contains('photo') &&
    !hud.root.classList.contains('ending') && !hud.root.querySelector('#cine.on');
  if (!active) { rt.army.missionMarkedEnemy = null; return false; }
  // 稲生・桶狭間は本人の頭上の▼だけ。画面端の「敵」や別の矢印へ誘わない。
  // 間合い・残る命・命中も、この同じ▼で示す。
  if (rt.def.missionStyle === 'raid' || rt.def.missionStyle === 'lesson') {
    rt.army.missionMarkedEnemy = markedEnemy(rt) || null;
    return false;
  }
  // 任務が選んだ本人を先にする。敵の選び直しと見通しは四分の一秒ごと。
  const assigned = markedEnemy(rt);
  if (hud.enemySignRt !== rt || hud.enemySignAt == null || rt.t >= hud.enemySignAt || rt.t < hud.enemySignAt - .25) {
    if (hud.enemySignRt !== rt) hud.enemySignUnit = null;
    hud.enemySignRt = rt; hud.enemySignAt = rt.t + .25;
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
    hud.enemySignUnit = signEnemyAlive(reachable, me) && signEnemySeen(rt, reachable, me) ? reachable : nearest;
  }
  const u = assigned || (!rt.def.missionSignTarget && hud.enemySignUnit);
  rt.army.missionMarkedEnemy = u || null;
  const lesson = rt.def.missionStyle === 'lesson';
  if (lesson && !inouSignVisible(rt, u)) return false;
  const head = lesson && u ? inouSignHeight(u) : u?.mounted ? 3.05 : Math.max(2.1, (u?.bodyHeight || 1.72) + .35);
  // 霧や壁の向こうの敵は新たに明かさない。戦闘や難しさの判定は変えない。
  if (!u || !u.alive || Math.hypot(u.pos.x - me.pos.x, u.pos.z - me.pos.z) > Math.min(weatherSight(rt.world), rt.world.vis ?? 680) ||
      !weatherSees(rt.world, me.pos, u.pos) ||
      cameraWallBlocked(rt, me.pos, u.pos, me.pos.y + 1.6, u.pos.y + head)) return false;
  const W = VIEW.w, H = VIEW.h, rects = hud.hudRects();
  goalPoint.set(u.pos.x, u.pos.y + head, u.pos.z).project(rt.camera);
  let x = (goalPoint.x + 1) * W / 2, y = (1 - goalPoint.y) * H / 2;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  const sa = safeInsets();
  const onScreen = goalPoint.z >= -1 && goalPoint.z <= 1 && x >= sa.left + 40 && x <= W - sa.right - 40 && y >= sa.top + 80 && y <= H - sa.bottom - 24;
  const visible = onScreen && !cameraWallBlocked(rt, rt.camera.position, u.pos, rt.camera.position.y, u.pos.y + head) &&
    !rects.some(r => x + 32 > r.left && x - 32 < r.right && y + 8 > r.top && y - 72 < r.bottom);
  if (!enemyTarget) {
    enemyTarget = document.createElement('div');
    enemyTarget.id = 'mission-enemy-target';
    enemyTarget.setAttribute('aria-label', 'この敵をたおせ');
    enemyTarget.style.cssText = 'position:absolute;left:0;top:0;width:56px;height:48px;pointer-events:none;z-index:4';
    enemyTarget.innerHTML = '<svg width="56" height="64" viewBox="0 0 56 64" aria-hidden="true" style="position:absolute;left:0;top:-7px"><path d="M7 27H49L28 55Z" fill="#ff342e" stroke="#14120f" stroke-width="14" stroke-linejoin="round"/><path d="M7 27H49L28 55Z" fill="#24120f" stroke="#fff3df" stroke-width="6" stroke-linejoin="round"/><defs><clipPath id="mission-enemy-life"><rect x="0" y="27" width="56" height="28"/></clipPath></defs><path d="M11 30H45L28 51Z" fill="#ff342e" clip-path="url(#mission-enemy-life)"/></svg><svg width="24" height="24" viewBox="0 0 48 48" aria-hidden="true" style="position:absolute;left:16px;top:-28px"><path d="M8 19H25V10L40 24L25 38V29H8Z" fill="#ff342e" stroke="#14120f" stroke-width="4" stroke-linejoin="round"/></svg><i aria-hidden="true" style="position:absolute;box-sizing:border-box;border:4px solid #fff3df;outline:3px solid #14120f;border-radius:8px;box-shadow:inset 0 0 0 2px #14120f"></i>';
    enemyTarget._symbol = enemyTarget.children[0];
    enemyTarget._direction = enemyTarget.children[1];
    enemyTarget._frame = enemyTarget.children[2];
    enemyTarget._life = enemyTarget.querySelector('clipPath rect');
    const label = document.createElement('b');
    label.textContent = '敵';
    label.style.cssText = 'position:absolute;left:50%;top:-24px;transform:translateX(-50%);padding:1px 6px;background:#14120f;color:#fff3df;font:bold 16px/1.4 sans-serif;white-space:nowrap';
    enemyTarget.appendChild(label);
  }
  if (enemyTarget.parentNode !== hud.root) hud.root.appendChild(enemyTarget);
  // 残る命は同じ▼の赤い面積で示し、棒や札を足さない。
  const life = Math.max(0, Math.min(1, u.hp / (u.maxHp || 1)));
  enemyTarget._life.setAttribute('y', String(55 - 28 * life));
  enemyTarget._life.setAttribute('height', String(28 * life));
  // 人物を囲まず、頭上も画面端も同じ大きな▼を一つだけ出す。
  enemyTarget._frame.hidden = true;
  if (!visible) {
    // 回り道の案内中は、壁越しの相手への直線矢印を重ねない。
    if (target(rt)?.route) return false;
    rt.camera.getWorldDirection(goalDirection);
    const yaw = Math.atan2(goalDirection.x, goalDirection.z);
    // 稲生の振り向きは画面の視点から測り、目前でも矢印と見える位置をそろえる。
    const origin = lesson ? rt.camera.position : me.pos;
    const gx = u.pos.x - origin.x, gz = u.pos.z - origin.z;
    const right = -gx * Math.cos(yaw) + gz * Math.sin(yaw);
    const forward = gx * Math.sin(yaw) + gz * Math.cos(yaw);
    enemyTarget._direction.style.transform = `rotate(${Math.atan2(-forward, right)}rad)`;
    x = right >= 0 ? W - sa.right - 48 : sa.left + 48;
    const top = sa.top + 96, bottom = H - sa.bottom - 80, preferred = Math.max(top, Math.min(bottom, H * (forward < 0 ? .65 : .4)));
    let best = Infinity, found = false;
    for (let i = 0; i <= 16; i++) {
      const cy = i === 0 ? preferred : top + (bottom - top) * (i - 1) / 15;
      if (rects.some(r => x + 32 > r.left && x - 32 < r.right && cy + 40 > r.top && cy - 64 < r.bottom)) continue;
      const delta = Math.abs(cy - preferred);
      if (delta < best) { best = delta; y = cy + 38; found = true; }
    }
    if (!found) return false;
  }
  enemyTarget._symbol.style.display = '';
  enemyTarget._direction.style.display = visible ? 'none' : '';
  // 画面外の方向矢印と『敵』を重ねない。
  enemyTarget.lastChild.style.top = visible ? '-24px' : '-54px';
  enemyTarget.style.transform = `translate(${(x - 28).toFixed(1)}px,${(y - 48).toFixed(1)}px)`;
  enemyTarget.hidden = false;
  hud.missionEnemyShown = true;
  hud.enemySignOffscreen = !visible;
  return true;
}
