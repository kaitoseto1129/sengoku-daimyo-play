// 守備は（移動の床矢印は11/3に全戦でやめた）判定と同じ外周の細い線（11/1：太い線と大きい矢印が画面を横切って見えた）。戦の進行や判定には触れない。
import * as THREE from 'three';
import { VIEW, safeInsets } from './viewport.js';
import { groundAt } from './floors.js';

const point = new THREE.Vector3();
const namespace = 'http://www.w3.org/2000/svg';

function project(rt, x, z, out) {
  out.set(x, groundAt(rt.world, x, z, rt.player.u.pos.y) + .14, z).project(rt.camera);
  if (out.z < -1 || out.z > 1) return false;
  out.x = (out.x + 1) * VIEW.w / 2;
  out.y = (1 - out.y) * VIEW.h / 2;
  return Number.isFinite(out.x) && Number.isFinite(out.y);
}

function clear(x, y, rects, halfX, halfY) {
  const sa = safeInsets();
  if (x < sa.left + halfX + 12 || x > VIEW.w - sa.right - halfX - 12 ||
      y < sa.top + halfY + 64 || y > VIEW.h - sa.bottom - halfY - 16) return false;
  for (const r of rects) if (x + halfX > r.left && x - halfX < r.right && y + halfY > r.top && y - halfY < r.bottom) return false;
  return true;
}

export function drawMissionGround(rt, el, want, rects) {
  el.hidden = true;
  if (!el._groundCue) {
    const group = document.createElementNS(namespace, 'g');
    group.innerHTML = '<path fill="none" stroke="#14120f" stroke-width="3.5" stroke-opacity=".45"/><path fill="none" stroke="#fff3ba" stroke-width="1.6" stroke-opacity=".8"/><path fill="#fff3ba" fill-opacity=".9" stroke="#14120f" stroke-width="2.5"/><g><path d="M0 0V-48H30L22-36L30-24H0" fill="#fff3ba" stroke="#14120f" stroke-width="5"/></g>';
    group.setAttribute('stroke-linejoin', 'round');
    el._lines.appendChild(group); el._groundCue = group;
  }
  const group = el._groundCue, parts = group.children, hud = rt.hud;
  group.style.display = '';
  for (const path of el._outlines) path.setAttribute('d', '');
  for (const path of el._links) path.setAttribute('d', '');
  el._targetBadge.setAttribute('d', '');
  let boundary = '', flagX = 0, flagY = 0, flag = false;
  const defend = !!want.defend, radius = want.r ?? 8;
    if (defend) {
    // 外周は残り時間で欠かさず、いつも実際の守備範囲を囲む。
    let connected = false;
    for (let i = 0; i <= 64; i++) {
      const angle = i * Math.PI * 2 / 64;
      if (!project(rt, want.x + Math.cos(angle) * radius, want.z + Math.sin(angle) * radius, point) ||
          !clear(point.x, point.y, rects, 6, 6)) { connected = false; continue; }
      boundary += `${connected ? 'L' : 'M'}${point.x.toFixed(1)} ${point.y.toFixed(1)}`;
      connected = true;
    }
    const bodies = hud.goalBodyRects(rt);
    let best = Infinity;
    // 旗は範囲内の空いた床へ置き、兵・札・画面端から離す。
    for (let i = 0; i < 49; i++) {
      const a = i * Math.PI / 8, r = i === 0 ? 0 : radius * (i <= 16 ? .3 : i <= 32 ? .6 : .85);
      const wx = want.x + Math.cos(a) * r, wz = want.z + Math.sin(a) * r;
      if (!project(rt, wx, wz, point) || !clear(point.x + 60, point.y - 20, rects, 74, 34)) continue;
      let occupied = false;
      for (let j = 0; j < hud.goalBodyCount; j += 4) {
        if (point.x + 134 > bodies[j] && point.x - 14 < bodies[j + 2] && point.y + 14 > bodies[j + 1] && point.y - 54 < bodies[j + 3]) { occupied = true; break; }
      }
      const score = Math.hypot(point.x - VIEW.w * .58, point.y - VIEW.h * .65) + (occupied ? 1000 : 0);
      if (score < best) { best = score; flagX = point.x; flagY = point.y; flag = true; }
    }
  }
  parts[0].setAttribute('d', boundary); parts[1].setAttribute('d', boundary);
  parts[2].setAttribute('d', '');
  parts[3].style.display = flag ? '' : 'none';
  if (flag) parts[3].setAttribute('transform', `translate(${flagX.toFixed(1)} ${flagY.toFixed(1)})`);
  // 小地図・体力・任務で三枚。守備の札は右上から旗の横へ移す。
  hud.root.classList.toggle('ground-defense', flag);
  el._lines.style.display = boundary || flag ? '' : 'none';
  hud.missionPinLabelShown = flag;
}
