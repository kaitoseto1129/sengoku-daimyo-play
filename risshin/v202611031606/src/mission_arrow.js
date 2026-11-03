// 行き先の大きな矢印の印（kaito 11/3 AJ）：本当に行く場所の真上に、ついていく相手の青い▼と同じ形で金色を立てる。
//   上下にゆっくり揺れ、遠くても読める大きさ。画面の上に描くので、建物や塀に隠れても輪郭が見える。
//   字は小さな任務の名だけ。画面外・背後は地面の道しるべ（mission_ground.js）の端の矢印に任せる。全戦で同じ部品。
import * as THREE from 'three';
import { VIEW, safeInsets } from './viewport.js';
import { groundAt } from './floors.js';

const point = new THREE.Vector3();
const namespace = 'http://www.w3.org/2000/svg';
const SHAPE = 'M-22-34H22L0 0Z';   // 青い▼（leader_follow.js の h22l-11 16Z）と同じ逆三角を大きく
let calm = null;

function make(rt) {
  const el = document.createElementNS(namespace, 'svg');
  el.setAttribute('aria-hidden', 'true');
  el.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:3;overflow:visible';
  el.innerHTML = `<g><path d="${SHAPE}" fill="none" stroke="#14120f" stroke-width="9" stroke-linejoin="round" stroke-opacity=".8"/><path d="${SHAPE}" fill="#f0b43a" stroke="#fff3ba" stroke-width="3" stroke-linejoin="round"/>` +
    '<text y="-44" text-anchor="middle" style="font:bold 13px sans-serif;fill:#fff3ba;stroke:#14120f;stroke-width:4px;paint-order:stroke;stroke-linejoin:round"></text></g>';
  rt.hud.root.appendChild(el);
  return el;
}

export function hideDestArrow(rt) {
  const el = rt.hud?.destArrow;
  if (el) el.style.display = 'none';
}

// 描けた時だけ true。行き先の真上の点（x, z）に先端を置く。
export function drawDestArrow(rt, want, rects) {
  let el = rt.hud.destArrow;
  if (el && !el.isConnected) el = rt.hud.destArrow = null;
  const me = rt.player.u.pos, W = VIEW.w, H = VIEW.h, sa = safeInsets();
  const dist = Math.hypot(want.x - me.x, want.z - me.z);
  if (dist < (want.r ?? 3) + .5) { if (el) el.style.display = 'none'; return false; }
  const gy = want.y ?? groundAt(rt.world, want.x, want.z, me.y);
  // 地面より 3.5m 上に先端。遠い所ほど少し高く、建物の上でも見える。
  point.set(want.x, gy + 3.5 + Math.min(10, dist * .06), want.z).project(rt.camera);
  const x = (point.x + 1) * W / 2, y = (1 - point.y) * H / 2;
  const ok = point.z >= -1 && point.z <= 1 && Number.isFinite(x) && Number.isFinite(y) &&
    x > sa.left + 40 && x < W - sa.right - 40 && y > sa.top + 90 && y < H - sa.bottom - 24 &&
    !rects.some(r => x + 24 > r.left && x - 24 < r.right && y + 4 > r.top && y - 70 < r.bottom);
  if (!ok) { if (el) el.style.display = 'none'; return false; }
  if (!el) el = rt.hud.destArrow = make(rt);
  if (calm === null) calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const bob = calm ? 0 : Math.sin(performance.now() / 380) * 7;
  const scale = Math.max(.8, Math.min(1.5, 1.5 - dist / 120));
  const g = el.firstChild;
  g.setAttribute('transform', `translate(${x.toFixed(1)} ${(y + bob).toFixed(1)}) scale(${scale.toFixed(2)})`);
  const label = rt.missionGuide?.label || '';
  const text = g.lastChild, words = label.length <= 8 ? label : '';
  if (text.textContent !== words) text.textContent = words;
  el.style.display = '';
  return true;
}
