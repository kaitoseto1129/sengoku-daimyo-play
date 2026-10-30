// ついていく本人のひし形と、実際の進路の矢印。全戦で同じ二つの形を使い回す。
import * as THREE from 'three';
import { VIEW, safeInsets } from './viewport.js';
import { groundAt } from './floors.js';
import { cameraWallBlocked } from './battle_sight.js';

const point = new THREE.Vector3(), direction = new THREE.Vector3();
const arrowX = [0, -.95, -.4, -.4, .4, .4, .95];
const arrowZ = [1.6, .25, .25, -1.4, -1.4, .25, .25];
export function updateFollowGuide(rt, destination) {
  const hud = rt.hud, me = rt.player.u;
  let el = hud.followGuide;
  if (el) el.style.display = 'none';
  const ally = destination?.followUnit || (destination?.follow ? destination.unit : null);
  if (!ally?.alive || ally.team !== me.team || ally.gone || ally.dying || ally.downed || ally.woundOut ||
      !me.alive || rt.over || rt.choice || hud.introWaiting || hud.bigmap || rt.player.camShot ||
      hud.root.classList.contains('photo') || hud.root.classList.contains('ending') || hud.root.querySelector('#cine.on')) return false;
  if (!el) {
    el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    el.setAttribute('aria-hidden', 'true');
    el.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:3';
    el.innerHTML = '<path fill="#ffe28a" stroke="#14120f" stroke-width="4" stroke-linejoin="round"/><path fill="#ffe28a" stroke="#14120f" stroke-width="4" stroke-linejoin="round"/>';
    hud.root.appendChild(el); hud.followGuide = el;
  }
  const W = VIEW.w, H = VIEW.h, sa = safeInsets(), rects = hud.hudRects();
  // 人物の枠は使い回されるため、座標だけをこの場で受け取る。
  const frame = ally.mesh?.visible !== false && !ally.camHidden &&
    !cameraWallBlocked(rt, rt.camera.position, ally.pos, rt.camera.position.y, ally.pos.y + 1.8) &&
    hud.measurePersonFrame(ally, rt, true);
  let badge = '';
  if (frame) {
    const x = frame.cx, y = frame.top - 24;
    if (x > sa.left + 24 && x < W - sa.right - 24 && y > sa.top + 24 && y < H - sa.bottom - 32 &&
        !rects.some(r => x + 20 > r.left && x - 20 < r.right && y + 20 > r.top && y - 20 < r.bottom))
      badge = `M${x} ${y - 18}l15 18-15 18-15-18Z`;
  }
  el.children[0].setAttribute('d', badge);
  const dx = destination.x - me.pos.x, dz = destination.z - me.pos.z, distance = Math.hypot(dx, dz);
  let arrow = '', onGround = distance > 1;
  const fx = distance > .01 ? dx / distance : 0, fz = distance > .01 ? dz / distance : 1;
  const ahead = Math.min(9, Math.max(5, distance * .5));
  for (let i = 0; i < arrowX.length && onGround; i++) {
    const x = me.pos.x + fx * (ahead + arrowZ[i]) + fz * arrowX[i];
    const z = me.pos.z + fz * (ahead + arrowZ[i]) - fx * arrowX[i];
    point.set(x, groundAt(rt.world, x, z, me.pos.y) + .08, z).project(rt.camera);
    const px = (point.x + 1) * W / 2, py = (1 - point.y) * H / 2;
    if (point.z < -1 || point.z > 1 || px < sa.left + 24 || px > W - sa.right - 24 ||
        py < sa.top + 72 || py > H - sa.bottom - 32 ||
        rects.some(r => px + 8 > r.left && px - 8 < r.right && py + 8 > r.top && py - 8 < r.bottom)) onGround = false;
    else arrow += `${i ? 'L' : 'M'}${px.toFixed(1)} ${py.toFixed(1)}`;
  }
  if (onGround) {
    el.children[1].removeAttribute('transform');
    el.children[1].setAttribute('d', arrow + 'Z');
  } else {
    // 道が背後や画面外なら、同じ矢印を空いている端へ向ける。
    rt.camera.getWorldDirection(direction);
    const yaw = Math.atan2(direction.x, direction.z);
    const right = -dx * Math.cos(yaw) + dz * Math.sin(yaw);
    const forward = dx * Math.sin(yaw) + dz * Math.cos(yaw);
    let x = right >= 0 ? W - sa.right - 60 : sa.left + 60, y = H * .55;
    for (let i = 0; i < 8; i++) {
      y = sa.top + 104 + i * 24;
      if (y > H - sa.bottom - 64) break;
      if (rects.some(r => x + 32 > r.left && x - 32 < r.right && y + 32 > r.top && y - 32 < r.bottom)) continue;
      arrow = 'M-28-9H3V-23L30 0L3 23V9H-28Z';
      el.children[1].setAttribute('transform', `translate(${x} ${y}) rotate(${Math.atan2(-forward, right) * 180 / Math.PI})`);
      break;
    }
    el.children[1].setAttribute('d', arrow.startsWith('M-28') ? arrow : '');
  }
  el.style.display = '';
  return true;
}
