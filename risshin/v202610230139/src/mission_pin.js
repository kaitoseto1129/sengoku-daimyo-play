// 行き先は太い輪と旗。画面外では端の方向矢印に旗を添える。
//   戦の定義の missionPin(rt) が { x, z, r } を返す間だけ立てる（r＝着いたとみなす半径。定義の判定と同じ値を返す）。
//   待つ場所は着いても残す。印と投影用の点は一つを使い回す。
import * as THREE from 'three';
import { VIEW } from './viewport.js';
import { currentObjective } from './mission_guide.js';
import { groundAt } from './floors.js';
import { cameraWallBlocked } from './battle_sight.js';

let pin = null;
function make() {
  const el = document.createElement('div');
  el.id = 'mission-goal';
  el.innerHTML = '<svg width="80" height="80" viewBox="0 0 80 80" aria-hidden="true"><g class="goal-ground" stroke-linejoin="round"><ellipse cx="40" cy="68" rx="30" ry="9" fill="none" stroke="#14120f" stroke-width="10"/><ellipse cx="40" cy="68" rx="30" ry="9" fill="none" stroke="#fff3ba" stroke-width="5"/><path d="M32 8H48V37H61L40 59L19 37H32Z" fill="#fff3ba" stroke="#14120f" stroke-width="4"/></g><path class="goal-edge" d="M12 31H43V17L69 40L43 63V49H12Z" fill="#fff3ba" stroke="#14120f" stroke-width="4" stroke-linejoin="round" style="display:none;transform-origin:40px 40px"/></svg>';
  el.style.cssText = 'position:absolute;left:0;top:0;width:80px;height:80px;pointer-events:none;z-index:3';
  const style = document.createElement('style');
  style.textContent = '#hud.photo #mission-goal,#hud.ending #mission-goal,#hud:has(#bigmap:not([hidden])) #mission-goal,#hud:has(#cine.on) #mission-goal{display:none}';
  el.appendChild(style);
  el._rings = el.querySelectorAll('.goal-ground ellipse');
  for (const ring of el._rings) { ring.setAttribute('rx', '40'); ring.setAttribute('ry', '13'); }
  const flag = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  flag.setAttribute('d', 'M32 65V5H65L56 18L65 31H32');
  flag.setAttribute('fill', '#fff3ba'); flag.setAttribute('stroke', '#14120f');
  flag.setAttribute('stroke-width', '4'); flag.setAttribute('stroke-linejoin', 'round');
  flag.setAttribute('class', 'goal-flag');
  el.querySelector('svg').appendChild(flag);
  el.querySelector('svg').style.overflow = 'visible';
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
  tmp.x = g.pos.x; tmp.z = g.pos.z;
  // 戸口や曲がり角は六歩手前で印を消さず、すぐそばまで案内する。
  tmp.r = m.guideRadius ?? (m.entrance || m.id === 'next' ? 1 : 6);
  return tmp;
}

export function updateMissionPin(rt) {
  // 行き先の矢印は一本。画面外では方向と名前を同じ印に添える。
  rt.hud.missionPinLabelShown = false;
  rt.hud.missionPinOutside = false;
  const want = pinGuideOn(rt) && !rt.over && !rt.choice && !rt.hud.introWaiting && rt.player?.u?.alive ? target(rt) : null;
  if (!want) { if (pin) pin.hidden = true; return; }
  if (!pin) pin = make();
  const hud = rt.hud, root = hud.root;
  if (pin.parentNode !== root) root.appendChild(pin);
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
  const d = Math.hypot(want.x - me.x, want.z - me.z);
  const near = want.hide ?? (want.r || 6);
  const marker = rt.missionGuide?.marker;
  const waiting = want.waiting ?? (!want.unit && !!marker && (marker.waitAction || marker.waitGuide || /^(wait|guard)$/.test(marker.guideArea)));
  // 着いた・離れたの境で毎コマ出たり消えたりしない（チカチカ。kaito 10/23 稲生 27）。消えた後は一歩半離れてから出す。
  pin.hidden = !waiting && d <= near + (pin.hidden ? 1.5 : 0);
  if (pin.hidden) return;
  const W = VIEW.w, H = VIEW.h;
  // 人を追う時は本人の頭上へ固定し、地面の印を自分の印に見せない。
  if (want.unit) goalPoint.set(want.x, want.unit.pos.y + (want.unit.mounted ? 3.3 : 2.5), want.z);
  else goalPoint.set(U.x, U.y + .08, U.z);
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
    if (!found) return;
  }
  pin.querySelector('.goal-ground').style.display = outside ? 'none' : '';
  const person = !!want.unit;
  if (pin._enemy !== !!want.enemy) {
    pin._enemy = !!want.enemy;
    for (const part of pin.querySelectorAll('.goal-ground path,.goal-edge')) part.setAttribute('fill', want.enemy ? '#ff634d' : '#fff3ba');
  }
  pin.querySelector('.goal-ground path').style.display = person || want.dodge ? '' : 'none';
  const flag = pin.querySelector('.goal-flag');
  flag.style.display = person || want.dodge ? 'none' : '';
  // 端では旗を矢印の上へ置き、見えている時は輪の中心に竿を立てる。
  flag.setAttribute('transform', outside ? 'translate(0,-24) scale(.75)' : '');
  if (pin._person !== person) {
    pin._person = person;
    for (const ring of pin._rings) ring.style.display = person ? 'none' : '';
  }
  const arrow = pin.querySelector('.goal-edge');
  arrow.style.display = outside ? '' : 'none';
  arrow.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
  hud.missionPinOutside = outside;
  // 行き先の名前と向きの字は出さない。ピンだけで示す（kaito 10/23「行き先の名前とか出す必要ある？」）。
  // 丸めず小数一桁で置き、地面に固定する。
  pin.style.transform = `translate(${(x - 40).toFixed(1)}px,${(y - (outside ? 40 : 68)).toFixed(1)}px)`;
}
const goalPoint = new THREE.Vector3();
const goalDirection = new THREE.Vector3();
const pinAt = { x: 0, z: 0, y: 0, ox: 0, oy: 0, at: 0, rt: null };
function goalFree(x, y, W, H, rects) {
  // 輪と旗は八十画素。実寸と余白だけを避け、携帯横でも案内を畳まない。
  if (x < 52 || x > W - 52 || y < 80 || y > H - 52) return false;
  for (const r of rects) if (x + 48 >= r.left && x - 48 <= r.right && y + 48 >= r.top && y - 76 <= r.bottom) return false;
  return true;
}
