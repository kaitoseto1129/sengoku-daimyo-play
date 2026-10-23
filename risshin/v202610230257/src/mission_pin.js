// 行き先は旗。画面外では端の方向矢印に同じ旗を添える。
//   戦の定義の missionPin(rt) が { x, z, r } を返す間だけ立てる（r＝着いたとみなす半径。定義の判定と同じ値を返す）。
//   待つ場所は着いても残す。印と投影用の点は一つを使い回す。
import * as THREE from 'three';
import { VIEW } from './viewport.js';
import { currentObjective, missionWaitReached } from './mission_guide.js';
import { groundAt } from './floors.js';
import { cameraWallBlocked } from './battle_sight.js';

let pin = null;
function make() {
  const el = document.createElement('div');
  el.id = 'mission-goal';
  el.innerHTML = '<svg width="80" height="80" viewBox="0 0 80 80" aria-hidden="true"><g class="goal-ground" stroke-linejoin="round"><ellipse cx="40" cy="68" rx="30" ry="9" fill="none" stroke="#14120f" stroke-width="10"/><ellipse cx="40" cy="68" rx="30" ry="9" fill="none" stroke="#fff3ba" stroke-width="5"/><path d="M32 8H48V37H61L40 59L19 37H32Z" fill="#fff3ba" stroke="#14120f" stroke-width="4"/></g><path class="goal-edge" d="M12 31H43V17L69 40L43 63V49H12Z" fill="#fff3ba" stroke="#14120f" stroke-width="4" stroke-linejoin="round" style="display:none;transform-origin:40px 40px"/></svg>';
  el.style.cssText = 'position:absolute;left:0;top:0;width:80px;height:80px;pointer-events:none;z-index:3';
  const style = document.createElement('style');
  style.textContent = '#hud.photo :is(#mission-goal,#mission-flag-frame),#hud.ending :is(#mission-goal,#mission-flag-frame),#hud:has(#bigmap:not([hidden])) :is(#mission-goal,#mission-flag-frame),#hud:has(#cine.on) :is(#mission-goal,#mission-flag-frame){display:none}';
  el.appendChild(style);
  const label = document.createElement('button');
  label.type = 'button'; label.className = 'goal-label'; label.tabIndex = -1;
  label.style.cssText = 'position:absolute;top:72px;left:50%;transform:translateX(-50%);white-space:nowrap;background:#14120f;color:#fff3ba;border:0;border-radius:4px;padding:4px 8px;font:bold max(16px, calc(16px * var(--text-scale, 1))) sans-serif;line-height:1.4;pointer-events:none';
  el.appendChild(label); el._label = label;
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
  // 実物の布にも、画面端と同じ旗印を付ける。作るのは一度だけ。
  const badge = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  badge.setAttribute('viewBox', '0 0 80 80');
  badge.style.cssText = 'position:absolute;width:40px;height:40px;left:50%;top:-40px;transform:translateX(-50%);overflow:visible';
  badge.appendChild(flag.cloneNode(true));
  el._frame.appendChild(badge);
  // 到着したピンは旗を確認の形へ替え、同じ場所の丸が満ちるまで残す。
  // 形は初回だけ作り、待ち時間の更新では属性だけ替える。
  const hold = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  hold.innerHTML = '<circle cx="40" cy="28" r="22" fill="#14120f" stroke="#fff3ba" stroke-width="3"/><path class="goal-progress" fill="#e8c25a"/><path d="M27 28L36 37L53 19" fill="none" stroke="#14120f" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/><path d="M27 28L36 37L53 19" fill="none" stroke="#fff3ba" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>';
  hold.style.display = 'none';
  el.querySelector('svg').appendChild(hold);
  el._hold = hold; el._progress = hold.querySelector('.goal-progress');
  el.querySelector('svg').style.overflow = 'visible';
  const foot = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  foot.setAttribute('width', '80'); foot.setAttribute('height', '32');
  foot.innerHTML = '<ellipse cx="40" cy="16" rx="28" ry="8" fill="none" stroke="#14120f" stroke-width="9"/><ellipse cx="40" cy="16" rx="28" ry="8" fill="none" stroke="#fff3ba" stroke-width="4"/>';
  foot.style.cssText = 'position:absolute;left:0;top:0;overflow:visible;display:none';
  el.appendChild(foot); el._personFoot = foot;
  return el;
}

// 町・道場を除く全戦で、共通のピン一本で案内する。
export const pinGuideOn = (rt) => !!rt && !rt.def.town && !rt.def.dojo;

const tmp = { x: 0, z: 0, r: 6 };
export function missionTarget(rt) { return target(rt); }
function target(rt) {
  if (rt.def.missionPin) return rt.def.missionPin(rt);
  // 定義の無い戦は、任務の手引きが選んだ行き先（今の任務と同じ印・同じ半径）へ立てる。
  const g = rt.missionGuide, m = g?.marker;
  if (!m || !g.objective || g.objective.id === '_wait' || g.objective !== currentObjective(rt)) return null;
  const person = typeof m.guidePerson === 'function' ? m.guidePerson() : m.guidePerson;
  if (m.guidePerson && (!person?.alive || person.gone)) return null;
  tmp.unit = person || null;
  tmp.fire = m.guideSymbol === 'fire';
  tmp.footRing = !!person && person.team === rt.player.u.team;
  // 火の印は家の戸口へ付ける。歩いて作業する位置とは分ける。
  const pos = tmp.fire ? g.pos : m.guideDestination?.() || g.pos;
  tmp.x = person ? person.pos.x : pos.x; tmp.z = person ? person.pos.z : pos.z;
  const reached = missionWaitReached(rt);
  tmp.waiting = reached !== null && !person;
  tmp.arrived = tmp.waiting && reached;
  tmp.area = false;
  // 戸口や曲がり角は六歩手前で印を消さず、すぐそばまで案内する。
  tmp.r = m.guideRadius ?? (tmp.waiting ? 8 : m.entrance || m.id === 'next' ? 1 : 6);
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
  if (!want || !want.fire && !want.footRing && closeEnemy?.alive && !closeEnemy.gone && !closeEnemy.fleeing &&
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
    U.out = undefined; U.outAt = 0; pin.hidden = false;
  }
  else if (Math.hypot(want.x - U.x, want.z - U.z) > 0.8) {
    const k = 1 - Math.exp(-dt * 1.5);
    U.x += (want.x - U.x) * k; U.z += (want.z - U.z) * k;
    U.y += (groundAt(rt.world, U.x, U.z, me.y) - U.y) * k;
  }
  // 到着範囲のあるピンは判定地点と一致させ、補間で古い場所へ誘わない。
  if (want.area || want.waiting) {
    U.x = want.x; U.z = want.z; U.y = groundAt(rt.world, U.x, U.z, me.y);
  }
  const d = Math.hypot(want.x - me.x, want.z - me.z);
  const near = want.fire ? -2 : want.hide ?? (want.r ?? 6);
  const marker = rt.missionGuide?.marker;
  const waiting = want.waiting ?? (!want.unit && !!marker && (marker.waitAction || marker.waitGuide || /^(wait|guard)$/.test(marker.guideArea)));
  // 着いた・離れたの境で毎コマ出たり消えたりしない（チカチカ。kaito 10/23 稲生 27）。消えた後は一歩半離れてから出す。
  pin.hidden = !waiting && d <= near + (pin.hidden ? 1.5 : 0);
  if (pin.hidden) return;
  const W = VIEW.w, H = VIEW.h;
  // 人を追う時は本人の頭上へ固定し、地面の印を自分の印に見せない。
  if (want.unit) goalPoint.set(want.x, want.unit.pos.y + (want.unit.mounted ? 3.3 : 2.5), want.z);
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
  const arrived = !!want.arrived;
  pin.querySelector('.goal-ground path').style.display = !arrived && want.dodge ? '' : 'none';
  const flag = pin.querySelector('.goal-flag');
  flag.style.display = person || inouEnemy || want.fire || want.dodge || arrived && !person && !outside ? 'none' : '';
  pin._hold.style.display = arrived && !person && !outside ? '' : 'none';
  if (arrived) {
    const progress = Number.isFinite(want.progress) ? Math.max(0, Math.min(1, want.progress)) : 0;
    // 満ち切る直前まで扇形。完了は円にして合図の時刻とそろえる。
    const angle = Math.PI * 2 * Math.min(progress, .9999);
    pin._progress.setAttribute('d', progress >= 1
      ? 'M40 8A20 20 0 1 1 40 48A20 20 0 1 1 40 8'
      : progress > 0 ? `M40 28L40 8A20 20 0 ${progress > .5 ? 1 : 0} 1 ${40 + Math.sin(angle) * 20} ${28 - Math.cos(angle) * 20}Z` : '');
  }
  // 端では同じ旗を矢印の上へ置き、見えている時は目的の人や床に竿を合わせる。
  flag.setAttribute('transform', outside ? 'translate(0,-24) scale(.75)' : '');
  // 人の頭上や回避の矢印には輪を重ねず、地面の行き先だけに付ける。
  const groundRing = !person && !want.dodge;
  if (pin._groundRing !== groundRing) {
    pin._groundRing = groundRing;
    for (const ring of pin._rings) ring.style.display = groundRing ? '' : 'none';
  }
  // 本人の頭と足を同じ現在位置から投影する。旗の位置や群れの中心へ輪をずらさない。
  const foot = pin._personFoot;
  foot.style.display = 'none';
  if (person && want.footRing && !behind && !occluded) {
    footPoint.set(want.unit.pos.x, want.unit.pos.y + .08, want.unit.pos.z).project(rt.camera);
    const fx = (footPoint.x + 1) * W / 2, fy = (1 - footPoint.y) * H / 2;
    if (footPoint.z >= -1 && footPoint.z <= 1 && fx >= 32 && fx <= W - 32 && fy >= 16 && fy <= H - 16 &&
        !rects.some(r => fx + 32 > r.left && fx - 32 < r.right && fy + 14 > r.top && fy - 14 < r.bottom)) {
      foot.style.display = ''; foot.style.transform = `translate(${(fx - x).toFixed(1)}px,${(fy - y + (outside ? 24 : 52)).toFixed(1)}px)`;
    }
  }
  const arrow = pin.querySelector('.goal-edge');
  arrow.style.display = outside ? '' : 'none';
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
  const text = rt.def.key === 'inou' ? '' : want.fire ? working ? '火をつける（長押し）' : rt.G.lord ? '足軽が火をつける家' : 'この家で「火をつける」を長押し' : want.footRing ? 'この人のそばへ' : outside ? 'ここへ' : '';
  if (label.textContent !== text) label.textContent = text;
  label.hidden = !text;
  // 短い案内を端で切らず、同じ印の幅の中へ収める。
  label.style.maxWidth = '220px'; label.style.whiteSpace = 'normal';
  label.style.left = `${40 + Math.max(116 - x, Math.min(W - 116 - x, 0))}px`;
  label.style.top = outside ? '72px' : '60px';
  label.style.pointerEvents = working ? 'auto' : 'none';
  label.style.minHeight = working ? '44px' : '0';
  label.style.width = working ? '208px' : 'max-content';
  label.tabIndex = working ? 0 : -1;
  if (pin._work && pin._work !== (working ? action.id : null) && hud.workHoldId === pin._work) hud.workHoldId = null;
  pin._work = working ? action.id : null; pin._hud = hud; pin._rt = rt;
  hud.missionPinLabelShown = !!text;
  // 丸めず小数一桁で置き、地面に固定する。
  pin.style.transform = `translate(${(x - 40).toFixed(1)}px,${(y - (outside ? 40 : 68)).toFixed(1)}px)`;
}
const footPoint = new THREE.Vector3();
const goalPoint = new THREE.Vector3();
const goalDirection = new THREE.Vector3();
const pinAt = { x: 0, z: 0, y: 0, ox: 0, oy: 0, at: 0, rt: null };
function goalFree(x, y, W, H, rects) {
  // 輪と旗は八十画素。実寸と余白だけを避け、携帯横でも案内を畳まない。
  if (x < 52 || x > W - 52 || y < 80 || y > H - 68) return false;
  for (const r of rects) if (x + 48 >= r.left && x - 48 <= r.right && y + 64 >= r.top && y - 76 <= r.bottom) return false;
  return true;
}
