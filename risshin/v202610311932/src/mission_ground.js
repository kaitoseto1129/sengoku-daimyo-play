// 移動は床の太い矢印、守備は判定と同じ外周。戦の進行や判定には触れない。
import * as THREE from 'three';
import { VIEW, safeInsets } from './viewport.js';
import { groundAt } from './floors.js';
import { cameraWallBlocked } from './battle_sight.js';

const point = new THREE.Vector3(), ahead = new THREE.Vector3(), direction = new THREE.Vector3();
const fallback = [{ x: 0, z: 0 }, { x: 0, z: 0 }];
const namespace = 'http://www.w3.org/2000/svg';
const arrowShape = [[30, 0], [5, -19], [5, -8], [-28, -8], [-28, 8], [5, 8], [5, 19]];

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

function arrow(x, y, angle, size = 1) {
  const c = Math.cos(angle) * size, s = Math.sin(angle) * size;
  let path = '';
  // 先端を進む方向へ向けた、明るい塗りの一本矢印。
  for (let i = 0; i < arrowShape.length; i++) {
    const a = arrowShape[i][0], b = arrowShape[i][1];
    path += `${i ? 'L' : 'M'}${(x + a * c - b * s).toFixed(1)} ${(y + a * s + b * c).toFixed(1)}`;
  }
  return path + 'Z';
}

export function drawMissionGround(rt, el, want, rects) {
  el.hidden = true;
  if (!el._groundCue) {
    const group = document.createElementNS(namespace, 'g');
    group.innerHTML = '<path fill="none" stroke="#14120f" stroke-width="10"/><path fill="none" stroke="#fff3ba" stroke-width="5"/><path fill="#fff3ba" stroke="#14120f" stroke-width="6"/><g><path d="M0 0V-48H30L22-36L30-24H0" fill="#fff3ba" stroke="#14120f" stroke-width="5"/></g>';
    group.setAttribute('stroke-linejoin', 'round');
    el._lines.appendChild(group); el._groundCue = group;
  }
  const group = el._groundCue, parts = group.children, hud = rt.hud, p = rt.player.u.pos;
  group.style.display = '';
  for (const path of el._outlines) path.setAttribute('d', '');
  for (const path of el._links) path.setAttribute('d', '');
  el._targetBadge.setAttribute('d', '');
  let boundary = '', arrows = '', flagX = 0, flagY = 0, flag = false;
  const defend = !!want.defend, radius = want.r ?? 8;
  const distance = Math.hypot(want.x - p.x, want.z - p.z);
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
  if (!defend || distance >= radius) {
    const path = rt.def.guidePath?.(rt, want.marker) || fallback;
    if (path === fallback) { fallback[0].x = p.x; fallback[0].z = p.z; fallback[1].x = want.x; fallback[1].z = want.z; }
    let count = 0, covered = 0, lastX = -1000, lastY = -1000;
    // 手前から最大三本。歩くにつれて次の床へつながる。角がある戦は既存の経路を使う。
    for (let k = 1; k < path.length && count < 3; k++) {
      const a = path[k - 1], b = path[k], length = Math.hypot(b.x - a.x, b.z - a.z);
      for (let step = 1; step <= Math.ceil(length) && count < 3 && covered + step <= 36; step++) {
        const t = Math.min(1, step / Math.max(.01, length));
        const wx = a.x + (b.x - a.x) * t, wz = a.z + (b.z - a.z) * t;
        ahead.set(wx, groundAt(rt.world, wx, wz, p.y) + .14, wz);
        if (Math.hypot(wx - p.x, wz - p.z) < 2 || cameraWallBlocked(rt, rt.camera.position, ahead) ||
            !project(rt, wx, wz, point) || !clear(point.x, point.y, rects, 42, 34) || Math.hypot(point.x - lastX, point.y - lastY) < 76) continue;
        const next = Math.min(1, t + .8 / Math.max(.01, length));
        // 終点のすぐ手前を投影し、到着地点でも矢印の向きを保つ。
        const before = next === t;
        if (!project(rt, a.x + (b.x - a.x) * (before ? Math.max(0, t - .1) : next), a.z + (b.z - a.z) * (before ? Math.max(0, t - .1) : next), ahead)) continue;
        const angle = Math.atan2((ahead.y - point.y) * (before ? -1 : 1), (ahead.x - point.x) * (before ? -1 : 1));
        arrows += arrow(point.x, point.y, angle, count ? .8 : 1.15);
        lastX = point.x; lastY = point.y; count++;
      }
      covered += length;
    }
    if (!arrows) {
      // 背後や画面外でも矢印を消さず、同じ行き先への向きを示す。
      rt.camera.getWorldDirection(direction);
      const yaw = Math.atan2(direction.x, direction.z), dx = want.x - p.x, dz = want.z - p.z;
      const angle = Math.atan2(-(dx * Math.sin(yaw) + dz * Math.cos(yaw)), -dx * Math.cos(yaw) + dz * Math.sin(yaw));
      for (let i = 0; i < 12; i++) {
        const x = VIEW.w * .5 + (i % 2 ? -1 : 1) * Math.ceil(i / 2) * 64, y = VIEW.h - 88;
        if (clear(x, y, rects, 44, 38)) { arrows = arrow(x, y, angle, 1.15); break; }
      }
      hud.missionPinOutside = true;
    }
  }
  parts[0].setAttribute('d', boundary); parts[1].setAttribute('d', boundary);
  parts[2].setAttribute('d', arrows);
  parts[3].style.display = flag ? '' : 'none';
  if (flag) parts[3].setAttribute('transform', `translate(${flagX.toFixed(1)} ${flagY.toFixed(1)})`);
  // 小地図・体力・任務で三枚。守備の札は右上から旗の横へ移す。
  hud.root.classList.toggle('ground-defense', flag);
  el._lines.style.display = boundary || arrows || flag ? '' : 'none';
  hud.missionPinLabelShown = flag;
}
