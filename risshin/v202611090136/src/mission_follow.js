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
  // ついていく相手と同じ人なら、頭上は青い印（leader_follow.js）だけにする
  if (frame && ally !== rt.leaderFollow?.unit) {
    const x = frame.cx, y = frame.top - 24;
    if (x > sa.left + 24 && x < W - sa.right - 24 && y > sa.top + 24 && y < H - sa.bottom - 32 &&
        !rects.some(r => x + 20 > r.left && x - 20 < r.right && y + 20 > r.top && y - 20 < r.bottom))
      badge = `M${x} ${y - 18}l15 18-15 18-15-18Z`;
  }
  el.children[0].setAttribute('d', badge);
  const dx = destination.x - me.pos.x, dz = destination.z - me.pos.z, distance = Math.hypot(dx, dz);
  // 地面・画面端の矢印は全戦でやめた（kaito 11/3 BH）。行き先は真上の▼だけ
  el.children[1].setAttribute('d', '');
  el.style.display = '';
  return true;
}
